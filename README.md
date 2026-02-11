# Stimate API

Express API for audio transcription and construction cost estimation using OpenAI Whisper and GPT.

## Features

- 🎙️ Audio transcription using OpenAI Whisper
- 🤖 AI-powered construction task extraction using GPT
- 📊 Detailed logging for debugging
- 🌐 CORS enabled for frontend integration
- ⚡ Processing time tracking

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your OpenAI API key:
```bash
cp .env.example .env
```

Then edit `.env` and add your actual API key:
```
OPENAI_API_KEY=sk-your-actual-key-here
PORT=3000
```

## Running the Server

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`)

## API Endpoints

### POST /api/transcribe

Transcribes an audio file and extracts construction tasks.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Audio file with field name `audio`

**Supported audio formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm

**Example using curl:**
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -F "audio=@./audio-test.mp3"
```

**Example using JavaScript fetch:**
```javascript
const formData = new FormData();
formData.append('audio', audioFile);

const response = await fetch('http://localhost:3000/api/transcribe', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
```

**Response:**
```json
{
  "success": true,
  "transcription": "full transcription text...",
  "processingTime": {
    "transcription": "3.45s",
    "analysis": "2.87s",
    "total": "6.32s"
  },
  "tasks": [
    {
      "room_name": "Salon",
      "task_name": "Peinture murale",
      "description": "Blanc cassé",
      "quantity": 45.5,
      "unit": "m²",
      "hypotheses": null
    }
  ]
}
```

## Server Logs

When you make a request, you'll see detailed logs in the console:

```
📥 [2026-02-11T10:30:45.123Z] POST /api/transcribe
🎵 Audio file received: { filename: 'audio.mp3', size: '245.67 KB', mimetype: 'audio/mpeg' }
🎙️  Starting Whisper transcription...
✅ Transcription completed in 3.45s
📝 Transcription preview: Je voudrais peindre le salon en blanc...
🤖 Starting GPT analysis...
✅ GPT analysis completed in 2.87s
📊 Extracted 5 tasks
🗑️  Cleaned up temporary file
✨ Total processing time: 6.32s
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## Testing with Frontend

A test frontend is included in [`test-frontend.html`](test-frontend.html). To use it:

1. Start the server:
```bash
npm start
```

2. Open `test-frontend.html` in your browser

3. Upload an audio file and see the results with real-time processing feedback

The frontend shows:
- Processing time for each step
- Full transcription
- Extracted tasks with all details

## Error Handling

If an error occurs, the API will return:
```json
{
  "success": false,
  "error": "Error message"
}
```

Common errors:
- `400`: No audio file provided
- `500`: Server error (check logs for details)
