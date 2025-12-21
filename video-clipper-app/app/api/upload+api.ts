// API route handler for video upload
export async function POST(request: Request): Promise<Response> {
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const backendUrl = `${apiUrl}/upload`;

    // Get the form data from the request
    const formData = await request.formData();

    // Forward the request to the backend
    // Cast formData to BodyInit to satisfy TypeScript's fetch API
    const response = await fetch(backendUrl, {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: errorText || 'Upload failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[API Route] Upload error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
