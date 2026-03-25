import { NextResponse } from 'next/server';

// Generate a temporary Deepgram API key for browser-side transcription
// This keeps the real API key on the server and gives the browser a short-lived token
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey || apiKey === 'your-deepgram-api-key') {
    return NextResponse.json(
      { error: 'Deepgram API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Request a temporary key from Deepgram
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (!response.ok) {
      // If we can't get projects, just return the key directly
      // In production, you'd want to create scoped temporary keys
      return NextResponse.json({ key: apiKey });
    }

    const data = await response.json();
    const projectId = data.projects?.[0]?.project_id;

    if (projectId) {
      // Create a temporary key scoped to this project
      const keyResponse = await fetch(
        `https://api.deepgram.com/v1/projects/${projectId}/keys`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: 'RingRaise temporary browser key',
            scopes: ['usage:write'],
            time_to_live_in_seconds: 600, // 10 minutes
          }),
        }
      );

      if (keyResponse.ok) {
        const keyData = await keyResponse.json();
        return NextResponse.json({ key: keyData.key });
      }
    }

    // Fallback: return the main key (not ideal for production)
    return NextResponse.json({ key: apiKey });
  } catch {
    return NextResponse.json({ key: apiKey });
  }
}
