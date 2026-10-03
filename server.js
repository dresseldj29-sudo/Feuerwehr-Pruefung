import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import OpenAI from "openai";
import { fileURLToPath } from "url";


/* =========================================================
   GRUNDKONFIGURATION
   ========================================================= */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


const app =
    express();


const PORT =
    Number(process.env.PORT || 3000);


/*
   DEINE WEBSITE

   Beispiel:

   https://dresseldj29-sudo.github.io/Feuerwehr-Pruefung/

   Wenn du lokal testest, kannst du "*" verwenden.
*/

const FRONTEND_URL =
    process.env.FRONTEND_URL || "*";


/* =========================================================
   ADMIN
   ========================================================= */

const ADMIN_EMAIL =
    process.env.ADMIN_EMAIL ||
    "Ausbilder@gmail.com";


const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "Admin";


/* =========================================================
   OPENAI
   ========================================================= */

const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;


const OPENAI_MODEL =
    process.env.OPENAI_MODEL ||
    "gpt-6-luna";


let openai = null;


if(OPENAI_API_KEY){

    openai =
        new OpenAI({
            apiKey:OPENAI_API_KEY
        });

}


/* =========================================================
   EXPRESS
   ========================================================= */

app.use(
    cors({
        origin: FRONTEND_URL === "*"
            ? true
            : FRONTEND_URL.split(",")
                .map(x => x.trim())
    })
);


app.use(
    express.json({
        limit:"10mb"
    })
);


/* =========================================================
   DATENBANK
   ========================================================= */

const DATA_FILE =
    path.join(
        __dirname,
        "data.json"
    );


function defaultData(){

    return {

        pruefungen:[],

        ergebnisse:[]

    };

}


function ladeDaten(){

    try{

        if(!fs.existsSync(DATA_FILE)){

            const daten =
                defaultData();

            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(
                    daten,
                    null,
                    2
                ),
                "utf8"
            );

            return daten;

        }


        const text =
            fs.readFileSync(
                DATA_FILE,
                "utf8"
            );


        const daten =
            JSON.parse(text);


        return {

            pruefungen:
                Array.isArray(daten.pruefungen)
                ? daten.pruefungen
                : [],

            ergebnisse:
                Array.isArray(daten.ergebnisse)
                ? daten.ergebnisse
                : []

        };


    }catch(error){

        console.error(
            "Datenbank konnte nicht geladen werden:",
            error
        );


        return defaultData();

    }

}


let daten =
    ladeDaten();


function speichereDaten(){

    const tempFile =
        DATA_FILE + ".tmp";


    fs.writeFileSync(
        tempFile,
        JSON.stringify(
            daten,
            null,
            2
        ),
        "utf8"
    );


    fs.renameSync(
        tempFile,
        DATA_FILE
    );

}


/* =========================================================
   AUTHENTIFIZIERUNG
   ========================================================= */

const adminSessions =
    new Map();


function erstelleToken(){

    return crypto
        .randomBytes(32)
        .toString("hex");

}


function adminErforderlich(
    req,
    res,
    next
){

    const header =
        req.headers.authorization || "";


    const token =
        header.startsWith("Bearer ")
        ? header.slice(7)
        : "";


    if(
        !token ||
        !adminSessions.has(token)
    ){

        return res
            .status(401)
            .json({
                error:"Nicht autorisiert."
            });

    }


    next();

}


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

function neueID(prefix){

    return (
        prefix +
        "_" +
        crypto
            .randomBytes(10)
            .toString("hex")
    );

}


function normalisiereCode(code){

    return String(code || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g,"");

}


function neuerPruefungscode(){

    let code;


    do{

        code =
            "FW-" +
            Math.random()
                .toString(36)
                .substring(2,7)
                .toUpperCase();

    }while(
        daten.pruefungen.some(
            p => p.code === code
        )
    );


    return code;

}


function findePruefung(code){

    return daten.pruefungen.find(
        p =>
            p.code ===
            normalisiereCode(code)
    );

}


function clamp(
    value,
    min,
    max
){

    return Math.min(
        max,
        Math.max(
            min,
            Number(value)
        )
    );

}


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
    "/",
    (req,res) => {

        res.json({

            name:
                "Feuerwehr Prüfungsplattform",

            status:
                "online",

            ki:
                Boolean(openai),

            version:
                "3.0"

        });

    }
);


app.get(
    "/api/gesundheit",
    (req,res) => {

        res.json({

            ok:true,

            ki:
                Boolean(openai),

            pruefungen:
                daten.pruefungen.length,

            ergebnisse:
                daten.ergebnisse.length

        });

    }
);


/* =========================================================
   ADMIN LOGIN
   ========================================================= */

app.post(
    "/api/admin/login",
    (req,res) => {

        const {
            email,
            password
        } = req.body || {};


        if(
            email !== ADMIN_EMAIL ||
            password !== ADMIN_PASSWORD
        ){

            return res
                .status(401)
                .json({
                    error:
                        "E-Mail oder Passwort ist falsch."
                });

        }


        const token =
            erstelleToken();


        adminSessions.set(
            token,
            {
                email,
                createdAt:
                    Date.now()
            }
        );


        res.json({

            ok:true,

            token

        });

    }
);


/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */

app.get(
    "/api/admin/dashboard",
    adminErforderlich,
    (req,res) => {

        const gesamt =
            daten.ergebnisse.length;


        const bestanden =
            daten.ergebnisse.filter(
                r => r.bestanden
            ).length;


        const quote =
            gesamt === 0
            ? 0
            : Math.round(
                bestanden /
                gesamt *
                100
            );


        res.json({

            pruefungen:
                daten.pruefungen.length,

            ergebnisse:
                gesamt,

            bestanden,

            quote

        });

    }
);


/* =========================================================
   PRÜFUNGEN – ADMIN
   ========================================================= */

app.get(
    "/api/admin/pruefungen",
    adminErforderlich,
    (req,res) => {

        res.json({

            pruefungen:
                daten.pruefungen

        });

    }
);


/* =========================================================
   PRÜFUNGEN – TEILNEHMER
   ========================================================= */

app.get(
    "/api/pruefungen/code/:code",
    (req,res) => {

        const pruefung =
            findePruefung(
                req.params.code
            );


        if(!pruefung){

            return res
                .status(404)
                .json({
                    error:
                        "Prüfung wurde nicht gefunden."
                });

        }


        /*
          Niemals die richtigen Antworten
          an den Teilnehmer schicken.
        */

        const sichereFragen =
            pruefung.fragen.map(
                frage => {

                    const kopie = {
                        ...frage
                    };


                    delete kopie.loesung;


                    return kopie;

                }
            );


        res.json({

            pruefung:{

                id:
                    pruefung.id,

                code:
                    pruefung.code,

                titel:
                    pruefung.titel,

                beschreibung:
                    pruefung.beschreibung,

                zeit:
                    pruefung.zeit,

                bestehensgrenze:
                    pruefung.bestehensgrenze,

                fragen:
                    sichereFragen

            }

        });

    }
);


/* =========================================================
   KI PRÜFUNG ERSTELLEN
   ========================================================= */

app.post(
    "/api/admin/ki/pruefung",
    adminErforderlich,
    async (req,res) => {

        try{

            if(!openai){

                return res
                    .status(500)
                    .json({
                        error:
                            "OPENAI_API_KEY wurde auf dem Server nicht eingerichtet."
                    });

            }


            const {

                material,

                titel,

                fragen = 10,

                schwierigkeit = "mittel",

                zeit = 30,

                bestehen = 70

            } = req.body || {};


            if(
                typeof material !== "string" ||
                material.trim().length < 50
            ){

                return res
                    .status(400)
                    .json({
                        error:
                            "Der Ausbildungsstoff ist zu kurz."
                    });

            }


            const anzahl =
                clamp(
                    fragen,
                    1,
                    50
                );


            const zeitMinuten =
                clamp(
                    zeit,
                    1,
                    180
                );


            const bestehensgrenze =
                clamp(
                    bestehen,
                    1,
                    100
                );


            const systemPrompt = `

Du bist eine professionelle deutsche Feuerwehr-Ausbildungs-KI.

Deine Aufgabe ist es, aus dem vom Ausbilder gelieferten
Ausbildungsstoff eine realistische Feuerwehrprüfung zu erstellen.

WICHTIG:

- Verwende ausschließlich Informationen aus dem gelieferten Ausbildungsstoff.
- Erfinde keine Feuerwehrregeln.
- Erfinde keine Gesetzesparagraphen.
- Erfinde keine Einsatzvorschriften.
- Wenn eine Information nicht im Material steht, frage sie nicht ab.
- Die Prüfung soll fachlich verständlich formuliert sein.
- Die Fragen sollen für eine echte Feuerwehr-Ausbildung geeignet sein.
- Erstelle unterschiedliche Fragetypen.
- Multiple Choice darf genau eine richtige Antwort haben.
- Richtig/Falsch muss eindeutig sein.
- Freitextfragen müssen anhand des Materials bewertbar sein.

Die Antwort muss ausschließlich valides JSON sein.

JSON-Format:

{
  "beschreibung": "string",
  "fragen": [
    {
      "typ": "multiple",
      "frage": "string",
      "optionen": [
        "string",
        "string",
        "string",
        "string"
      ],
      "loesung": 0,
      "punkte": 1
    },
    {
      "typ": "truefalse",
      "frage": "string",
      "loesung": true,
      "punkte": 1
    },
    {
      "typ": "text",
      "frage": "string",
      "loesung": "string",
      "punkte": 2
    }
  ]
}

Bei multiple ist "loesung" der Index der richtigen Antwort.

Bei truefalse ist "loesung" true oder false.

Bei text ist "loesung" eine Musterantwort.

Erstelle genau ${anzahl} Fragen.

Schwierigkeit:
${schwierigkeit}

Ausbildungsstoff:
${material}

`;


            const response =
                await openai.responses.create({

                    model:
                        OPENAI_MODEL,

                    input:[
                        {
                            role:"system",

                            content:
                                systemPrompt
                        },

                        {
                            role:"user",

                            content:
                                "Erstelle jetzt die Prüfung als JSON."
                        }
                    ],

                    text:{
                        format:{
                            type:"json_object"
                        }
                    }

                });


            const raw =
                response.output_text;


            if(!raw){

                throw new Error(
                    "Die KI hat keine Antwort geliefert."
                );

            }


            let kiDaten;


            try{

                kiDaten =
                    JSON.parse(raw);

            }catch(error){

                console.error(
                    "KI JSON:",
                    raw
                );

                throw new Error(
                    "Die KI hat kein gültiges JSON zurückgegeben."
                );

            }


            if(
                !Array.isArray(
                    kiDaten.fragen
                )
            ){

                throw new Error(
                    "Die KI hat keine gültigen Fragen erstellt."
                );

            }


            const validierteFragen =
                kiDaten.fragen
                    .slice(0,anzahl)
                    .map(
                        (frage,index) => {

                            if(
                                frage.typ === "multiple"
                            ){

                                const optionen =
                                    Array.isArray(
                                        frage.optionen
                                    )
                                    ? frage.optionen
                                        .slice(0,4)
                                        .map(
                                            x =>
                                                String(x)
                                        )
                                    : [];


                                let loesung =
                                    Number(
                                        frage.loesung
                                    );


                                if(
                                    optionen.length < 2
                                ){

                                    throw new Error(
                                        `Frage ${index+1} hat zu wenige Antwortmöglichkeiten.`
                                    );

                                }


                                if(
                                    loesung < 0 ||
                                    loesung >= optionen.length
                                ){

                                    loesung = 0;

                                }


                                return {

                                    id:
                                        neueID("frage"),

                                    typ:
                                        "multiple",

                                    frage:
                                        String(
                                            frage.frage ||
                                            ""
                                        ),

                                    optionen,

                                    loesung,

                                    punkte:
                                        clamp(
                                            frage.punkte || 1,
                                            1,
                                            10
                                        )

                                };

                            }


                            if(
                                frage.typ === "truefalse"
                            ){

                                return {

                                    id:
                                        neueID("frage"),

                                    typ:
                                        "truefalse",

                                    frage:
                                        String(
                                            frage.frage ||
                                            ""
                                        ),

                                    loesung:
                                        Boolean(
                                            frage.loesung
                                        ),

                                    punkte:
                                        clamp(
                                            frage.punkte || 1,
                                            1,
                                            10
                                        )

                                };

                            }


                            return {

                                id:
                                    neueID("frage"),

                                typ:
                                    "text",

                                frage:
                                    String(
                                        frage.frage ||
                                        ""
                                    ),

                                loesung:
                                    String(
                                        frage.loesung ||
                                        ""
                                    ),

                                punkte:
                                    clamp(
                                        frage.punkte || 2,
                                        1,
                                        10
                                    )

                            };

                        }
                    );


            if(
                validierteFragen.length === 0
            ){

                throw new Error(
                    "Es konnten keine Fragen erstellt werden."
                );

            }


            const pruefung = {

                id:
                    neueID("pruefung"),

                code:
                    neuerPruefungscode(),

                titel:
                    String(
                        titel ||
                        "Feuerwehr Prüfung"
                    ),

                beschreibung:
                    String(
                        kiDaten.beschreibung ||
                        "Automatisch mit der Feuerwehr-KI erstellt."
                    ),

                zeit:
                    zeitMinuten,

                bestehensgrenze,

                fragen:
                    validierteFragen,

                createdAt:
                    new Date().toISOString()

            };


            daten.pruefungen.push(
                pruefung
            );


            speichereDaten();


            res.json({

                ok:true,

                pruefung

            });


        }catch(error){

            console.error(
                "KI Fehler:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        error.message ||
                        "Fehler bei der KI."
                });

        }

    }
);


/* =========================================================
   ERGEBNIS ABGEBEN
   ========================================================= */

app.post(
    "/api/teilnehmer/abgabe",
    async (req,res) => {

        try{

            const {

                pruefungCode,

                vorname,

                nachname,

                feuerwehr,

                antworten

            } = req.body || {};


            const pruefung =
                findePruefung(
                    pruefungCode
                );


            if(!pruefung){

                return res
                    .status(404)
                    .json({
                        error:
                            "Prüfung wurde nicht gefunden."
                    });

            }


            if(
                !vorname ||
                !nachname ||
                !feuerwehr
            ){

                return res
                    .status(400)
                    .json({
                        error:
                            "Teilnehmerdaten fehlen."
                    });

            }


            if(
                !Array.isArray(antworten)
            ){

                return res
                    .status(400)
                    .json({
                        error:
                            "Antworten fehlen."
                    });

            }


            let punkte = 0;

            let maxPunkte = 0;


            const bewertung = [];


            pruefung.fragen.forEach(
                (frage,index) => {

                    const antwort =
                        antworten[index] ?? "";


                    const fragePunkte =
                        Number(
                            frage.punkte || 1
                        );


                    maxPunkte +=
                        fragePunkte;


                    let richtig = false;

                    let erhalten = 0;


                    if(
                        frage.typ === "multiple"
                    ){

                        const gegeben =
                            Number(
                                antwort
                            );


                        richtig =
                            gegeben ===
                            Number(
                                frage.loesung
                            );


                        if(richtig){

                            erhalten =
                                fragePunkte;

                        }

                    }


                    else if(
                        frage.typ === "truefalse"
                    ){

                        const gegeben =
                            String(
                                antwort
                            ).toLowerCase() ===
                            "true";


                        richtig =
                            gegeben ===
                            Boolean(
                                frage.loesung
                            );


                        if(richtig){

                            erhalten =
                                fragePunkte;

                        }

                    }


                    else if(
                        frage.typ === "text"
                    ){

                        /*
                           Freitextfragen werden hier
                           zunächst nicht automatisch
                           als richtig bewertet.

                           Sie können vom Ausbilder
                           später kontrolliert werden.
                        */

                        richtig = false;

                        erhalten = 0;

                    }


                    punkte +=
                        erhalten;


                    bewertung.push({

                        frage:
                            frage.frage,

                        antwort,

                        richtig,

                        erhalten,

                        max:
                            fragePunkte

                    });

                }
            );


            const prozent =
                maxPunkte === 0
                ? 0
                : Math.round(
                    punkte /
                    maxPunkte *
                    100
                );


            const bestanden =
                prozent >=
                Number(
                    pruefung.bestehensgrenze
                );


            const ergebnis = {

                id:
                    neueID("ergebnis"),

                pruefungId:
                    pruefung.id,

                pruefungCode:
                    pruefung.code,

                pruefungTitel:
                    pruefung.titel,

                vorname:
                    String(vorname),

                nachname:
                    String(nachname),

                feuerwehr:
                    String(feuerwehr),

                punkte,

                maxPunkte,

                prozent,

                bestehensgrenze:
                    pruefung.bestehensgrenze,

                bestanden,

                bewertung,

                status:
                    bewertung.some(
                        x =>
                            x.frage &&
                            !x.richtig &&
                            x.max > 1
                    )
                    ? "automatisch"
                    : "automatisch",

                createdAt:
                    new Date().toISOString()

            };


            daten.ergebnisse.push(
                ergebnis
            );


            speichereDaten();


            res.json({

                ok:true,

                ergebnis

            });


        }catch(error){

            console.error(
                "Abgabe Fehler:",
                error
            );


            res
                .status(500)
                .json({
                    error:
                        "Die Prüfung konnte nicht gespeichert werden."
                });

        }

    }
);


/* =========================================================
   ADMIN ERGEBNISSE
   ========================================================= */

app.get(
    "/api/admin/ergebnisse",
    adminErforderlich,
    (req,res) => {

        const ergebnisse =
            [...daten.ergebnisse]
                .sort(
                    (a,b) =>
                        new Date(b.createdAt) -
                        new Date(a.createdAt)
                );


        res.json({

            ergebnisse

        });

    }
);


/* =========================================================
   404
   ========================================================= */

app.use(
    (req,res) => {

        res
            .status(404)
            .json({
                error:
                    "API-Endpunkt nicht gefunden."
            });

    }
);


/* =========================================================
   FEHLER
   ========================================================= */

app.use(
    (error,req,res,next) => {

        console.error(
            "Serverfehler:",
            error
        );


        res
            .status(500)
            .json({
                error:
                    "Interner Serverfehler."
            });

    }
);


/* =========================================================
   SERVER START
   ========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "🚒 Feuerwehr Prüfungsplattform"
        );

        console.log(
            "======================================"
        );

        console.log(
            "Server:",
            `http://localhost:${PORT}`
        );

        console.log(
            "KI:",
            openai
                ? "AKTIV"
                : "NICHT KONFIGURIERT"
        );

        console.log(
            "Modell:",
            OPENAI_MODEL
        );

        console.log(
            "Datenbank:",
            DATA_FILE
        );

        console.log(
            "======================================"
        );

    }
);
