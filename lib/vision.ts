import Anthropic from '@anthropic-ai/sdk';
import * as FileSystem from 'expo-file-system/legacy';
import { Location } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function imageToBase64(uri: string): Promise<string> {
  // expo-file-system readAsStringAsync returns base64 when encoding is Base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

function getClient(apiKey?: string): Anthropic {
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic();
}

// ── Room Registration ─────────────────────────────────────────────────────────

export type RoomIdentificationResult = {
  suggested_name: string;
  description: string;        // stored for future matching
  icon: string;               // emoji that fits the room
  confidence: number;
};

/**
 * Called when the user is registering a new room.
 * Claude looks at the photo and suggests a name, description, and icon.
 */
export async function describeRoomForRegistration(
  imageUri: string,
  apiKey?: string
): Promise<RoomIdentificationResult> {
  const client = getClient(apiKey);
  const base64 = await imageToBase64(imageUri);

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `You are helping a villa owner register rooms in their property.
Look at this photo and identify what space this is.

Return ONLY a JSON object, no other text:
{
  "suggested_name": "short, natural room name (e.g. 'Master Bedroom', 'Kitchen', 'Pool Terrace')",
  "description": "2-3 sentence description of visual characteristics that would help identify this room in the future — mention distinctive features like colors, materials, views, furniture layout",
  "icon": "single emoji that best represents this room",
  "confidence": 0.0 to 1.0
}`,
          },
        ],
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

  return {
    suggested_name: json.suggested_name ?? 'New Room',
    description: json.description ?? '',
    icon: json.icon ?? '📍',
    confidence: json.confidence ?? 0.8,
  };
}

// ── Session Location Matching ─────────────────────────────────────────────────

export type RoomMatchResult = {
  matched_id: string | null;
  matched_name: string | null;
  suggested_name: string;
  description: string;
  confidence: number;
  is_new_room: boolean;
};

/**
 * Called during a session when the user takes a photo to identify where they are.
 * Claude compares the photo against registered rooms and either matches one or
 * suggests this is a new unregistered room.
 */
export async function identifyRoomFromPhoto(
  imageUri: string,
  knownLocations: Location[],
  apiKey?: string
): Promise<RoomMatchResult> {
  const client = getClient(apiKey);
  const base64 = await imageToBase64(imageUri);

  const roomDescriptions = knownLocations
    .filter(l => l.ai_description)
    .map(l => `- ID: "${l.id}" | Name: "${l.name}" | Description: ${l.ai_description}`)
    .join('\n');

  const prompt = knownLocations.length > 0
    ? `You are helping a villa owner identify which room they are currently in.

Known rooms in this villa:
${roomDescriptions}

Look at the photo and determine:
1. Does this match one of the known rooms above?
2. If yes, which one (use the exact ID)?
3. If no, what room is this?

Return ONLY a JSON object:
{
  "matched_id": "room ID from the list above, or null if no match",
  "matched_name": "matched room name or null",
  "suggested_name": "your best guess at what this room is called",
  "description": "brief description of what you see",
  "confidence": 0.0 to 1.0,
  "is_new_room": true if no match found, false if matched
}`
    : `You are helping identify a room in a villa. No rooms are registered yet.

Look at this photo and describe the room.

Return ONLY a JSON object:
{
  "matched_id": null,
  "matched_name": null,
  "suggested_name": "natural room name",
  "description": "brief description of what you see",
  "confidence": 0.9,
  "is_new_room": true
}`;

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

  return {
    matched_id: json.matched_id ?? null,
    matched_name: json.matched_name ?? null,
    suggested_name: json.suggested_name ?? 'Unknown Room',
    description: json.description ?? '',
    confidence: json.confidence ?? 0.5,
    is_new_room: json.is_new_room ?? true,
  };
}
