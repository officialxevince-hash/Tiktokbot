// API route handler for clip generation
export async function POST(request: Request): Promise<Response> {
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const backendUrl = `${apiUrl}/clip`;

    const body = await request.json();

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: errorText || 'Clip generation failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);     
  } catch (error) {
    console.error('[API Route] Clip generation error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

