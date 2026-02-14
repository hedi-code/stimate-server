/**
 * Express API for audio transcription and construction cost estimation
 *
 * Endpoint: POST /api/transcribe
 * - Accepts audio file uploads (multipart/form-data)
 * - Transcribes audio with Whisper
 * - Extracts construction tasks using GPT
 * - Returns structured JSON
 *
 * Requirements:
 *   npm install express multer openai
 *   Set OPENAI_API_KEY in environment variables
 */

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const cors = require("cors");
const morgan = require("morgan");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log("📁 Created uploads directory");
}

// Configure multer for file uploads with proper extension handling
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Preserve the original extension
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// Initialize OpenAI client from environment variable
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors()); // Enable CORS for frontend requests
app.use(express.json());
app.use(morgan("dev")); // HTTP request logger

// Custom logging middleware
app.use((req, res, next) => {
    console.log(`\n📥 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// POST /api/transcribe endpoint
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    const startTime = Date.now();

    try {
        console.log("🎵 Audio file received:", {
            filename: req.file?.originalname,
            size: `${(req.file?.size / 1024).toFixed(2)} KB`,
            mimetype: req.file?.mimetype
        });

        if (!req.file) {
            console.log("❌ No audio file provided");
            return res.status(400).json({ error: "No audio file provided" });
        }
        // ===============================
        // 1. TRANSCRIBE AUDIO WITH WHISPER
        // ===============================
        console.log("🎙️  Starting Whisper transcription...");
        const transcribeStart = Date.now();

        const transcription = await client.audio.transcriptions.create({
            file: fs.createReadStream(req.file.path),
            model: "whisper-1",
            response_format: "text",
        });

        const transcribeTime = ((Date.now() - transcribeStart) / 1000).toFixed(2);
        console.log(`✅ Transcription completed in ${transcribeTime}s`);
        console.log("📝 Transcription preview:", transcription.substring(0, 100) + "...");

        // ==================================================
        // 2. ANALYZE TRANSCRIPTION AND RETURN STRUCTURED JSON
        // ==================================================
        console.log("🤖 Starting GPT analysis...");
        const gptStart = Date.now();

        const response = await client.chat.completions.create({
            model: "gpt-5.2",
            temperature: 0,
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            messages: [
                {
                    role: "system",
                    content: `
# Rôle

Tu es un expert en métré et économie de la construction. Ton rôle est d'analyser la transcription brute d'une visite de chantier pour en extraire une liste structurée de tâches, calculer les quantités et les associer aux bons IDs d'un catalogue fourni.



# 1. Consignes d'Analyse

* **Analyse Chronologique :** Le texte est brut. Analyse le flux de la discussion. Si un avis change (ex: "On casse le mur... finalement non"), seule la DERNIÈRE décision validée compte. Ignore les tâches annulées.

* **Calculs :** Effectue les calculs nécessaires.

    * Pour les surfaces murales : Surface = (Longueur x Hauteur) - Ouvertures.

    * N'oublie jamais de soustraire les fenêtres/portes des surfaces à peindre si leurs dimensions sont connues ou standard.

* **Descriptions Spécifiques :** Si (et seulement si) des détails techniques importants sont mentionnés (couleur, marque, méthode spécifique), rédige une courte description dans le champ "description".

* **Zéro Initiative :** Ne devine rien en dehors des règles d'hypothèses ci-dessous.



# 2. Logique de Matching des IDs (Crucial)

Tu disposes d'une section "CATALOGUE DES TÂCHES (IDs)" plus bas. Pour chaque tâche identifiée dans la discussion, tu dois chercher l'ID correspondant dans ce catalogue.



**Règles de Matching :**

1.  **Matching Sémantique :** Analyse le nom de l'ID et sa description dans le catalogue pour trouver la correspondance la plus pertinente avec la tâche demandée.

2.  **Règle de Gamme (Peinture/Finitions) :**

    * Si le client ne précise pas de gamme (ex: "Il faut peindre"), sélectionne l'ID correspondant à la finition **NORMALE** ou **STANDARD**.

    * Si le client précise une gamme (ex: "Haut de gamme", "Luxe", "Entrée de gamme"), sélectionne l'ID correspondant spécifiquement.

3.  **Priorité d'affichage :** Dans le champ "task_name" du JSON, tu dois conserver **le nom naturel** extrait de la conversation (ex: "Casser le petit muret"), et NON le nom générique du catalogue. L'ID servira à la standardisation.

4.  **Échec de Matching :** Si aucune tâche du catalogue ne correspond de manière pertinente ou si tu as un doute trop fort, inscris la valeur **"Missing"** dans le champ "id".



# 3. Gestion des Données Manquantes et Hypothèses

Applique strictement ces règles si des dimensions sont absentes :



1.  **Hauteur Sous Plafond (HSP) manquante :**

    * Utilise une hauteur de calcul de **2,50m**.

    * Déclenche l'ajout de la clé "hypotheses" avec la valeur : "HSP 2,50m non confirmée".

2.  **Taille Portes/Fenêtres manquante :**

    * Utilise une taille standard pour les déductions.

    * Déclenche l'ajout de la clé "hypotheses" avec la valeur : "Taille ouvertures standard".

3.  **Dimensions mur/sol totalement manquantes (calcul impossible) :**

    * Indique "QUANTITÉ MANQUANTE" dans le champ "quantity".

    * Ajoute ta question (ex: "Quelle est la longueur du mur ?") dans le champ "hypotheses".

4.  **Pièce inconnue :**

    * Indique "LIEU MANQUANT" dans le champ "room_name".



# 4. Format de Réponse

Tu dois générer **un unique bloc de code JSON**. Ce bloc contiendra un tableau (Array) listant tous les objets.

Structure attendue : "[ {objet1}, {objet2}, ... ]"



**Règles d'affichage conditionnel (clés optionnelles) :**

* Si toutes les infos sont là et aucune hypothèse n'est prise : **NE PAS** inclure la clé "hypotheses".

* Si aucune spécificité technique n'est mentionnée (tâche standard) : **NE PAS** inclure la clé "description".



**Modèle d'objet JSON :**


{

  "room_name": "Nom de la pièce",

  "task_name": "Nom de la tâche (tel que dit dans la conversation)",

  "id": "ID_DU_CATALOGUE ou 'Missing'",

  "description": "Détails techniques SI PERTINENT",

  "quantity": "Nombre calculé OU la mention 'QUANTITÉ MANQUANTE'",

  "unit": "m², ml, ou unités",

  "hypotheses": "A RENTRER SEULEMENT SI UNE HYPOTHÈSE EST PRISE OU UNE QUESTION POSÉE"

}
`,
                },
                {
                    role: "user",
                    content: "TRANSCRIPTION DE LA VISITE : " + transcription + "\n CATALOGUE DES TÂCHES (IDs) : "+JSON.stringify(req.body.tasks),
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "tasks_schema",
                    schema: {
                        type: "object",
                        properties: {
                            tasks: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        room_name: { type: "string" },
                                        task_name: { type: "string" },
                                        description: { type: ["string", "null"] },
                                        quantity: { type: ["number", "string"] },
                                        unit: { type: ["string", "null"] },
                                        hypotheses: { type: ["string", "null"] }
                                    },
                                    required: ["room_name", "task_name", "quantity", "unit"]
                                }
                            }
                        },
                        required: ["tasks"]
                    }
                }
            }
        });

        const gptTime = ((Date.now() - gptStart) / 1000).toFixed(2);
        console.log(`✅ GPT analysis completed in ${gptTime}s`);

        // ===============================
        // 3. EXTRACT FINAL JSON RESULT
        // ===============================
        const result = JSON.parse(response.choices[0].message.content);
        console.log(`📊 Extracted ${result.tasks?.length || 0} tasks`);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        console.log("🗑️  Cleaned up temporary file");

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✨ Total processing time: ${totalTime}s`);

        // Return the result
        res.json({
            success: true,
            transcription: transcription,
            processingTime: {
                transcription: `${transcribeTime}s`,
                analysis: `${gptTime}s`,
                total: `${totalTime}s`
            },
            ...result
        });

    } catch (error) {
        console.error("❌ Error occurred:", {
            message: error.message,
            stack: error.stack
        });

        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log("🗑️  Cleaned up temporary file after error");
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
    console.log("✅ Health check passed");
    res.json({ status: "ok" });
});

// Start server
app.listen(PORT,'0.0.0.0', () => {
    console.log("\n🚀 ===================================");
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🚀 Transcribe endpoint: POST http://localhost:${PORT}/api/transcribe`);
    console.log(`🚀 Health check: GET http://localhost:${PORT}/api/health`);
    console.log("🚀 ===================================\n");
});
