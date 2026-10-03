import express from "express";
import cors from "cors";
import OpenAI from "openai";
import crypto from "crypto";

const app = express();

const PORT =
    process.env.PORT || 3000;

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "*";

const openai =
    new OpenAI({
        apiKey:
            process.env.OPENAI_API_KEY
    });


app.use(cors({
    origin: FRONTEND_URL === "*"
        ? true
        : FRONTEND_URL
}));

app.use(express.json({
    limit: "10mb"
}));


/* =========================================================
   DATEN
========================================================= */

const pruefungen = new Map();
const ergebnisse = new Map();


/* =========================================================
   START
========================================================= */

app.get("/", (req,res) => {

    res.json({
        name:
            "Feuerwehr Prüfungsplattform API",

        status:
            "online",

        version:
            "1.0.0"
    });

});


app.get(
    "/api/gesundheit",
    (req,res) => {

        res.json({
            ok: true,
            status: "online"
        });

    }
);


/* =========================================================
   PRÜFUNGSCODE
========================================================= */

function neuerCode() {

    let code;

    do {

        code =
            "FW-" +
            Math.random()
                .toString(36)
                .substring(2,7)
                .toUpperCase();

    } while (pruefungen.has(code));

    return code;

}


/* =========================================================
   KI
========================================================= */

app.post(
    "/api/ki/pruefung",
    async (req,res) => {

        try {

            const {
                title,
                topic,
                material,
                questionCount = 10,
                difficulty = "mittel",
                passPercent = 50,
                timeMinutes = 30
            } = req.body;


            if (
                !title ||
                !topic ||
                !material
            ) {

                return res.status(400).json({
                    error:
                        "Titel, Thema und Unterrichtsmaterial fehlen."
                });

            }


            const count =
                Math.min(
                    Math.max(
                        Number(questionCount) || 10,
                        1
                    ),
                    100
                );


            const prompt = `

Du bist eine professionelle KI für
Feuerwehr-Ausbildung in Deutschland.

Erstelle eine realistische theoretische
Feuerwehrprüfung.

THEMA:
${topic}

SCHWIERIGKEIT:
${difficulty}

ANZAHL FRAGEN:
${count}

UNTERRICHTSMATERIAL:
${material}

WICHTIG:

Erstelle die Fragen ausschließlich auf Basis
des bereitgestellten Unterrichtsmaterials.

Erfinde keine Ausbildungsregeln.

Verwende diese Fragetypen:

multiple
truefalse
text

Bei multiple müssen genau 4 Antwortmöglichkeiten
vorhanden sein.

Gib ausschließlich gültiges JSON zurück.

Format:

{
  "questions": [
    {
      "type": "multiple",
      "question": "...",
      "options": [
        "...",
        "...",
        "...",
        "..."
      ],
      "correct": 0
    }
  ]
}

Bei truefalse:

{
  "type": "truefalse",
  "question": "...",
  "correct": true
}

Bei text:

{
  "type": "text",
  "question": "...",
  "correct": "..."
}

`;


            const response =
                await openai.responses.create({

                    model:
                        process.env.OPENAI_MODEL ||
                        "gpt-6-luna",

                    input: [
                        {
                            role: "system",

                            content:
                                "Du erzeugst ausschließlich gültiges JSON für Feuerwehrprüfungen."
                        },

                        {
                            role: "user",

                            content: prompt
                        }
                    ],

                    text: {

                        format: {

                            type:
                                "json_object"

                        }

                    }

                });


            const text =
                response.output_text;


            const generated =
                JSON.parse(text);


            if (
                !generated.questions ||
                !Array.isArray(
                    generated.questions
                )
            ) {

                throw new Error(
                    "Die KI hat keine gültigen Fragen erzeugt."
                );

            }


            const code =
                neuerCode();


            const pruefung = {

                id:
                    crypto.randomUUID(),

                code,

                title,

                topic,

                difficulty,

                passPercent:
                    Number(passPercent) || 50,

                timeMinutes:
                    Number(timeMinutes) || 30,

                questions:
                    generated.questions,

                createdAt:
                    new Date().toISOString()

            };


            pruefungen.set(
                code,
                pruefung
            );


            res.json({

                ok: true,

                id:
                    pruefung.id,

                code,

                title,

                questions:
                    pruefung.questions

            });


        } catch(error) {

            console.error(error);

            res.status(500).json({

                error:
                    "KI-Fehler: " +
                    (
                        error.message ||
                        "Unbekannter Fehler"
                    )

            });

        }

    }
);


/* =========================================================
   ALLE PRÜFUNGEN
========================================================= */

app.get(
    "/api/pruefungen",
    (req,res) => {

        res.json(
            Array.from(
                pruefungen.values()
            )
        );

    }
);


/* =========================================================
   PRÜFUNG PER CODE
========================================================= */

app.get(
    "/api/pruefungen/code/:code",
    (req,res) => {

        const code =
            req.params.code
                .trim()
                .toUpperCase();


        const pruefung =
            pruefungen.get(code);


        if (!pruefung) {

            return res.status(404).json({

                error:
                    "Prüfung nicht gefunden."

            });

        }


        /*
         * Richtige Antworten werden hier NICHT
         * an den Teilnehmer geschickt.
         */

        const oeffentlich = {

            id:
                pruefung.id,

            code:
                pruefung.code,

            title:
                pruefung.title,

            topic:
                pruefung.topic,

            difficulty:
                pruefung.difficulty,

            passPercent:
                pruefung.passPercent,

            timeMinutes:
                pruefung.timeMinutes,

            questions:
                pruefung.questions.map(
                    frage => {

                        const kopie = {
                            ...frage
                        };

                        delete kopie.correct;

                        return kopie;

                    }
                )

        };


        res.json({
            pruefung:
                oeffentlich
        });

    }
);


/* =========================================================
   PRÜFUNG ABGEBEN
========================================================= */

app.post(
    "/api/teilnehmer/abgabe",
    (req,res) => {

        try {

            const {
                code,
                teilnehmer,
                answers
            } = req.body;


            const pruefung =
                pruefungen.get(
                    String(code)
                        .trim()
                        .toUpperCase()
                );


            if (!pruefung) {

                return res.status(404).json({

                    error:
                        "Prüfung nicht gefunden."

                });

            }


            let correct = 0;


            pruefung.questions.forEach(
                (frage,index) => {

                    const antwort =
                        answers?.[index];


                    if (
                        frage.type ===
                        "multiple"
                    ) {

                        if (
                            Number(antwort) ===
                            Number(frage.correct)
                        ) {

                            correct++;

                        }

                    }


                    else if (
                        frage.type ===
                        "truefalse"
                    ) {

                        const wert =
                            String(
                                antwort
                            ).toLowerCase()
                            === "true";


                        if (
                            wert ===
                            Boolean(
                                frage.correct
                            )
                        ) {

                            correct++;

                        }

                    }


                    else if (
                        frage.type ===
                        "text"
                    ) {

                        /*
                         * Textfragen werden bewusst
                         * nicht automatisch als richtig
                         * bewertet.
                         *
                         * Sie können später vom
                         * Ausbilder korrigiert werden.
                         */

                    }

                }
            );


            const total =
                pruefung.questions.length;


            const percent =
                Math.round(
                    (correct / total) * 100
                );


            const bestanden =
                percent >=
                pruefung.passPercent;


            const id =
                crypto.randomUUID();


            const ergebnis = {

                id,

                examId:
                    pruefung.id,

                code:
                    pruefung.code,

                pruefung:
                    pruefung.title,

                teilnehmer,

                answers,

                correct,

                total,

                percent,

                bestanden,

                createdAt:
                    new Date().toISOString()

            };


            ergebnisse.set(
                id,
                ergebnis
            );


            res.json({

                ok: true,

                id,

                correct,

                total,

                percent,

                bestanden

            });


        } catch(error) {

            console.error(error);

            res.status(500).json({

                error:
                    "Die Prüfung konnte nicht gespeichert werden."

            });

        }

    }
);


/* =========================================================
   ERGEBNIS
========================================================= */

app.get(
    "/api/ergebnis/:id",
    (req,res) => {

        const ergebnis =
            ergebnisse.get(
                req.params.id
            );


        if (!ergebnis) {

            return res.status(404).json({

                error:
                    "Ergebnis nicht gefunden."

            });

        }


        res.json(ergebnis);

    }
);


/* =========================================================
   AUSWERTUNG
========================================================= */

app.get(
    "/api/auswertung/:examId",
    (req,res) => {

        const liste =
            Array.from(
                ergebnisse.values()
            )
            .filter(
                ergebnis =>
                    ergebnis.examId ===
                    req.params.examId
            );


        res.json(liste);

    }
);


/* =========================================================
   SERVER
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            "🚒 Feuerwehr Prüfungsplattform läuft auf Port " +
            PORT
        );

    }
);
