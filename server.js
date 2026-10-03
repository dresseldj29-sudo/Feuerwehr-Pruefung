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
    Number(
        process.env.PORT || 3000
    );


/* =========================================================
   FRONTEND
========================================================= */

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "*";


/* =========================================================
   AUSbilder LOGIN
========================================================= */

/*
   GENAU DIE GEWÜNSCHTEN DATEN

   E-Mail:
   Ausbilder@gmail.com

   Passwort:
   Admin
*/

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
    process.env.OPENAI_API_KEY ||
    "";


const OPENAI_MODEL =
    process.env.OPENAI_MODEL ||
    "gpt-6-luna";


let openai = null;


if(OPENAI_API_KEY){

    openai =
        new OpenAI({
            apiKey:
                OPENAI_API_KEY
        });

}


/* =========================================================
   EXPRESS
========================================================= */

app.use(
    cors({
        origin:
            FRONTEND_URL === "*"
            ? true
            : FRONTEND_URL
                .split(",")
                .map(
                    x =>
                        x.trim()
                )
    })
);


app.use(
    express.json({
        limit:"15mb"
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


function neueDatenbank(){

    return {

        pruefungen:[],

        ergebnisse:[]

    };

}


function ladeDaten(){

    if(
        !fs.existsSync(
            DATA_FILE
        )
    ){

        const daten =
            neueDatenbank();


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


    try{

        const daten =
            JSON.parse(
                fs.readFileSync(
                    DATA_FILE,
                    "utf8"
                )
            );


        return {

            pruefungen:
                Array.isArray(
                    daten.pruefungen
                )
                ? daten.pruefungen
                : [],

            ergebnisse:
                Array.isArray(
                    daten.ergebnisse
                )
                ? daten.ergebnisse
                : []

        };

    }catch(error){

        console.error(
            "Fehler beim Lesen der Daten:",
            error
        );


        return neueDatenbank();

    }

}


let daten =
    ladeDaten();


function speichereDaten(){

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(
            daten,
            null,
            2
        ),
        "utf8"
    );

}


/* =========================================================
   ADMIN SESSIONS
========================================================= */

const sessions =
    new Map();


function neuesToken(){

    return crypto
        .randomBytes(32)
        .toString("hex");

}


function adminErforderlich(
    req,
    res,
    next
){

    const authorization =
        req.headers.authorization ||
        "";


    const token =
        authorization.startsWith(
            "Bearer "
        )
        ? authorization.substring(7)
        : "";


    if(
        !token ||
        !sessions.has(token)
    ){

        return res
            .status(401)
            .json({
                error:
                    "Nicht angemeldet."
            });

    }


    next();

}


/* =========================================================
   ID
========================================================= */

function neueID(prefix){

    return (
        prefix +
        "_" +
        crypto
            .randomBytes(12)
            .toString("hex")
    );

}


/* =========================================================
   CODE
========================================================= */

function normalisiereCode(
    code
){

    return String(
        code || ""
    )
    .trim()
    .toUpperCase();

}


function neuerPruefungscode(){

    let code;


    do{

        code =
            "FW-" +
            Math.random()
                .toString(36)
                .substring(
                    2,
                    7
                )
                .toUpperCase();

    }while(
        daten.pruefungen.some(
            p =>
                p.code ===
                code
        )
    );


    return code;

}


/* =========================================================
   PRÜFUNG SUCHEN
========================================================= */

function findePruefung(
    code
){

    const normal =
        normalisiereCode(
            code
        );


    return daten.pruefungen.find(
        p =>
            p.code ===
            normal
    );

}


/* =========================================================
   BEGRENZEN
========================================================= */

function begrenzen(
    value,
    min,
    max
){

    const nummer =
        Number(value);


    if(
        !Number.isFinite(
            nummer
        )
    ){

        return min;

    }


    return Math.min(
        max,
        Math.max(
            min,
            nummer
        )
    );

}


/* =========================================================
   START
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
                Boolean(
                    openai
                ),

            version:
                "4.0"

        });

    }
);


/* =========================================================
   GESUNDHEIT
========================================================= */

app.get(
    "/api/gesundheit",
    (req,res) => {

        res.json({

            ok:true,

            ki:
                Boolean(
                    openai
                ),

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

        const email =
            String(
                req.body?.email ||
                ""
            )
            .trim();


        const password =
            String(
                req.body?.password ||
                ""
            );


        if(
            email !==
                ADMIN_EMAIL ||
            password !==
                ADMIN_PASSWORD
        ){

            return res
                .status(401)
                .json({
                    error:
                        "E-Mail oder Passwort ist falsch."
                });

        }


        const token =
            neuesToken();


        sessions.set(
            token,
            {
                email,

                createdAt:
                    Date.now()
            }
        );


        res.json({

            ok:true,

            token,

            email:
                ADMIN_EMAIL

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

        const ergebnisse =
            daten.ergebnisse;


        const bestanden =
            ergebnisse.filter(
                e =>
                    e.bestanden
            ).length;


        const gesamt =
            ergebnisse.length;


        const quote =
            gesamt === 0
            ? 0
            : Math.round(
                (
                    bestanden /
                    gesamt
                ) * 100
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
   ALLE PRÜFUNGEN
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
   PRÜFUNG FÜR TEILNEHMER
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
                        "Prüfung nicht gefunden."
                });

        }


        /*
           LÖSUNGEN WERDEN ENTFERNT.
           Der Teilnehmer darf niemals
           die richtigen Antworten erhalten.
        */

        const fragen =
            pruefung.fragen.map(
                frage => {

                    const sicher =
                        {
                            ...frage
                        };


                    delete sicher.loesung;


                    return sicher;

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

                fragen

            }

        });

    }
);


/* =========================================================
   KI PRÜFUNG
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
                            "OPENAI_API_KEY ist auf dem Backend nicht eingerichtet."
                    });

            }


            const material =
                String(
                    req.body?.material ||
                    ""
                ).trim();


            const titel =
                String(
                    req.body?.titel ||
                    "Feuerwehr Prüfung"
                ).trim();


            const anzahl =
                begrenzen(
                    req.body?.fragen ||
                    10,
                    1,
                    50
                );


            const schwierigkeit =
                String(
                    req.body?.schwierigkeit ||
                    "mittel"
                );


            const zeit =
                begrenzen(
                    req.body?.zeit ||
                    30,
                    1,
                    180
                );


            const bestehen =
                begrenzen(
                    req.body?.bestehen ||
                    70,
                    1,
                    100
                );


            if(
                material.length < 50
            ){

                return res
                    .status(400)
                    .json({
                        error:
                            "Der Ausbildungsstoff ist zu kurz."
                    });

            }


            const systemPrompt = `

Du bist eine professionelle deutsche Feuerwehr-Ausbildungs-KI.

Erstelle aus dem gelieferten Ausbildungsstoff
eine realistische Prüfung.

WICHTIGE REGELN:

1. Verwende ausschließlich Informationen,
   die im Ausbildungsstoff enthalten sind.

2. Erfinde keine Fakten.

3. Erfinde keine Paragraphen.

4. Erfinde keine Feuerwehrvorschriften.

5. Keine Informationen aus dem Internet verwenden.

6. Fragen müssen eindeutig sein.

7. Verwende unterschiedliche Fragetypen.

8. Multiple Choice:
   genau eine Antwort ist richtig.

9. Richtig/Falsch:
   die Aussage muss eindeutig sein.

10. Freitext:
    eine Musterantwort angeben.

11. Die Prüfung muss auf Deutsch sein.

12. Erstelle genau ${anzahl} Fragen.

Schwierigkeit:
${schwierigkeit}

Ausbildungsstoff:

${material}

Antworte ausschließlich mit JSON.

Format:

{
  "beschreibung": "Beschreibung der Prüfung",
  "fragen": [
    {
      "typ": "multiple",
      "frage": "Frage",
      "optionen": [
        "Antwort A",
        "Antwort B",
        "Antwort C",
        "Antwort D"
      ],
      "loesung": 0,
      "punkte": 1
    },
    {
      "typ": "truefalse",
      "frage": "Aussage",
      "loesung": true,
      "punkte": 1
    },
    {
      "typ": "text",
      "frage": "Frage",
      "loesung": "Musterantwort",
      "punkte": 2
    }
  ]
}

`;


            const response =
                await openai.responses.create({

                    model:
                        OPENAI_MODEL,

                    input:[
                        {
                            role:
                                "system",

                            content:
                                systemPrompt

                        },

                        {
                            role:
                                "user",

                            content:
                                "Erstelle jetzt die Prüfung."
                        }
                    ],

                    text:{
                        format:{
                            type:
                                "json_object"
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


            let ki;


            try{

                ki =
                    JSON.parse(
                        raw
                    );

            }catch(error){

                console.error(
                    "Ungültige KI-Antwort:",
                    raw
                );


                throw new Error(
                    "Die KI hat kein gültiges JSON erzeugt."
                );

            }


            if(
                !Array.isArray(
                    ki.fragen
                )
            ){

                throw new Error(
                    "Die KI hat keine Fragen erzeugt."
                );

            }


            const fragen =
                ki.fragen
                    .slice(
                        0,
                        anzahl
                    )
                    .map(
                        (frage,index) => {

                            const typ =
                                [
                                    "multiple",
                                    "truefalse",
                                    "text"
                                ].includes(
                                    frage.typ
                                )
                                ? frage.typ
                                : "text";


                            if(
                                typ ===
                                "multiple"
                            ){

                                let optionen =
                                    Array.isArray(
                                        frage.optionen
                                    )
                                    ?
                                    frage.optionen
                                        .slice(
                                            0,
                                            4
                                        )
                                        .map(
                                            x =>
                                                String(
                                                    x
                                                )
                                        )
                                    :
                                    [];


                                if(
                                    optionen.length <
                                    2
                                ){

                                    optionen = [
                                        "Antwort A",
                                        "Antwort B",
                                        "Antwort C",
                                        "Antwort D"
                                    ];

                                }


                                let loesung =
                                    Number(
                                        frage.loesung
                                    );


                                if(
                                    !Number.isInteger(
                                        loesung
                                    ) ||
                                    loesung < 0 ||
                                    loesung >=
                                        optionen.length
                                ){

                                    loesung =
                                        0;

                                }


                                return {

                                    id:
                                        neueID(
                                            "frage"
                                        ),

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
                                        begrenzen(
                                            frage.punkte ||
                                            1,
                                            1,
                                            10
                                        )

                                };

                            }


                            if(
                                typ ===
                                "truefalse"
                            ){

                                return {

                                    id:
                                        neueID(
                                            "frage"
                                        ),

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
                                        begrenzen(
                                            frage.punkte ||
                                            1,
                                            1,
                                            10
                                        )

                                };

                            }


                            return {

                                id:
                                    neueID(
                                        "frage"
                                    ),

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
                                    begrenzen(
                                        frage.punkte ||
                                        2,
                                        1,
                                        10
                                    )

                            };

                        }
                    );


            if(
                fragen.length === 0
            ){

                throw new Error(
                    "Keine gültigen Fragen erzeugt."
                );

            }


            const pruefung = {

                id:
                    neueID(
                        "pruefung"
                    ),

                code:
                    neuerPruefungscode(),

                titel,

                beschreibung:
                    String(
                        ki.beschreibung ||
                        "Automatisch mit der Feuerwehr-KI erstellt."
                    ),

                zeit,

                bestehensgrenze:
                    bestehen,

                fragen,

                createdAt:
                    new Date()
                        .toISOString()

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
   PRÜFUNG ABGEBEN
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
                            "Prüfung nicht gefunden."
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
                !Array.isArray(
                    antworten
                )
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


            pruefung.fragen
                .forEach(
                    (frage,index) => {

                        const antwort =
                            antworten[index] ??
                            "";


                        const fragePunkte =
                            Number(
                                frage.punkte ||
                                1
                            );


                        maxPunkte +=
                            fragePunkte;


                        let richtig =
                            false;


                        let erhalten =
                            0;


                        /*
                           MULTIPLE CHOICE
                        */

                        if(
                            frage.typ ===
                            "multiple"
                        ){

                            richtig =
                                Number(
                                    antwort
                                ) ===
                                Number(
                                    frage.loesung
                                );


                            if(richtig){

                                erhalten =
                                    fragePunkte;

                            }

                        }


                        /*
                           RICHTIG / FALSCH
                        */

                        else if(
                            frage.typ ===
                            "truefalse"
                        ){

                            const gegeben =
                                String(
                                    antwort
                                ).toLowerCase()
                                ===
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


                        /*
                           FREITEXT
                        */

                        else if(
                            frage.typ ===
                            "text"
                        ){

                            /*
                               Freitext wird gespeichert
                               und zunächst nicht automatisch
                               als richtig gewertet.
                            */

                            richtig =
                                false;

                            erhalten =
                                0;

                        }


                        punkte +=
                            erhalten;


                        bewertung.push({

                            frage:
                                frage.frage,

                            typ:
                                frage.typ,

                            antwort:
                                String(
                                    antwort
                                ),

                            richtig,

                            erhalten,

                            max:
                                fragePunkte,

                            musterantwort:
                                frage.loesung

                        });

                    }
                );


            const prozent =
                maxPunkte === 0
                ? 0
                : Math.round(
                    (
                        punkte /
                        maxPunkte
                    ) *
                    100
                );


            const bestanden =
                prozent >=
                Number(
                    pruefung.bestehensgrenze
                );


            const ergebnis = {

                id:
                    neueID(
                        "ergebnis"
                    ),

                pruefungId:
                    pruefung.id,

                pruefungCode:
                    pruefung.code,

                pruefungTitel:
                    pruefung.titel,

                vorname:
                    String(
                        vorname
                    ),

                nachname:
                    String(
                        nachname
                    ),

                feuerwehr:
                    String(
                        feuerwehr
                    ),

                punkte,

                maxPunkte,

                prozent,

                bestehensgrenze:
                    pruefung.bestehensgrenze,

                bestanden,

                bewertung,

                createdAt:
                    new Date()
                        .toISOString()

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
                        "Prüfung konnte nicht gespeichert werden."
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
            [
                ...daten.ergebnisse
            ]
            .sort(
                (a,b) =>
                    new Date(
                        b.createdAt
                    ) -
                    new Date(
                        a.createdAt
                    )
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
   SERVER
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "🚒 FEUERWEHR PRÜFUNGSPLATTFORM"
        );

        console.log(
            "========================================"
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
            "KI-Modell:",
            OPENAI_MODEL
        );

        console.log(
            "Ausbilder:",
            ADMIN_EMAIL
        );

        console.log(
            "Daten:",
            DATA_FILE
        );

        console.log(
            "========================================"
        );

    }
);
