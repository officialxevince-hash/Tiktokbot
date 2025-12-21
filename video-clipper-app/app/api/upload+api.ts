// API route handler for video upload
export async function POST(request: Request): Promise<Response> {
  try {
    // Use environment variable or default to production backend
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://tiktokbot-rust.onrender.com';
    const backendUrl = `${apiUrl}/upload`;

    console.log('[API Route] Upload - Backend URL:', backendUrl);
    console.log('[API Route] EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);

    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get('file');
    console.log('[API Route] File received:', file ? 'Yes' : 'No');
    if (file instanceof File) {
      console.log('[API Route] File name:', file.name);
      console.log('[API Route] File size:', file.size);
      console.log('[API Route] File type:', file.type);
    }

    // Forward the request to the backend
    // Cast formData to BodyInit to satisfy TypeScript's fetch API
    const response = await fetch(backendUrl, {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    console.log('[API Route] Backend response status:', response.status);
    console.log('[API Route] Backend response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API Route] Backend error response:', errorText);
      return Response.json(
        { error: errorText || 'Upload failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[API Route] Upload success');
    return Response.json(data);
  } catch (error) {
    console.error('[API Route] Upload error:', error);
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
