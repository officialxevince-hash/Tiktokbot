
// API route handler for backend config
// This proxies requests to the backend or can be used as a serverless function
export async function GET(request: Request): Promise<Response> {
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const backendUrl = `${apiUrl}/config`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: 'Failed to fetch config' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[API Route] Config error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

