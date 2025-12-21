// API route handler for clip generation
export async function POST(request: Request): Promise<Response> {
  try {
    // Use environment variable or default to production backend
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://tiktokbot-rust.onrender.com';
    const backendUrl = `${apiUrl}/clip`;

    console.log('[API Route] Clip generation - Backend URL:', backendUrl);
    console.log('[API Route] EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);

    const body = await request.json();
    console.log('[API Route] Request body:', JSON.stringify(body));

    // Create AbortController for timeout (clip generation can take 60+ seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds timeout

    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        // Increase timeout for long-running operations
        // Note: This is a Node.js/undici specific option
      } as RequestInit & { signal?: AbortSignal });

      clearTimeout(timeoutId);
      
      console.log('[API Route] Backend response status:', response.status);
      console.log('[API Route] Backend response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API Route] Backend error response:', errorText);
        return Response.json(
          { error: errorText || 'Clip generation failed' },
          { status: response.status }
        );
      }

      const data = await response.json();
      console.log('[API Route] Clip generation success');
      return Response.json(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[API Route] Request timeout - clip generation may still be processing');
        return Response.json(
          { error: 'Request timeout. Clip generation may still be processing on the server.' },
          { status: 504 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('[API Route] Clip generation error:', error);
    if (error instanceof Error) {
      console.error('[API Route] Error message:', error.message);
      console.error('[API Route] Error stack:', error.stack);
      return Response.json(
        { error: `Internal server error: ${error.message}` },
        { status: 500 }
      );
    }
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

