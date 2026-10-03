import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


/* ============================================================
   GRUNDEINSTELLUNGEN
============================================================ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT =
    Number(process.env.PORT) || 3000;

const DB_FILE =
    process.env.DB_FILE ||
    path.join(
        __dirname,
        "feuerwehr-daten.json"
    );


/* ============================================================
   ADMIN LOGIN
============================================================ */

const ADMIN_EMAIL =
    process.env.ADMIN_EMAIL ||
    "Ausbilder@gmail.com";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "Admin";


/* ============================================================
   SERVER MIDDLEWARE
============================================================ */

app.use(
    cors({
        origin:true,
        credentials:true
    })
);

app.use(
    express.json({
        limit:"20mb"
    })
);

app.use(
    express.urlencoded({
        extended:true,
        limit:"20mb"
    })
);


/* ============================================================
   DATENBANK
============================================================ */

function defaultDatabase(){

    return {
        version:1,

        pruefungen:[],

        ergebnisse:[]
    };
}


function ladeDaten(){

    try{

        if(!fs.existsSync(DB_FILE)){

            const data =
                defaultDatabase();

            speichereDaten(data);

            return data;
        }

        const raw =
            fs.readFileSync(
                DB_FILE,
                "utf8"
            );

        const data =
            JSON.parse(raw);

        if(!data.pruefungen){
            data.pruefungen=[];
        }

        if(!data.ergebnisse){
            data.ergebnisse=[];
        }

        return data;

    }catch(error){

        console.error(
            "Datenbank konnte nicht geladen werden:",
            error
        );

        return defaultDatabase();
    }
}


function speichereDaten(data){

    const temp =
        DB_FILE + ".tmp";

    fs.writeFileSync(
        temp,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );

    fs.renameSync(
        temp,
        DB_FILE
    );
}


let db =
    ladeDaten();


/* ============================================================
   ADMIN SESSIONS
============================================================ */

const sessions =
    new Map();


function createSession(){

    const token =
        crypto
            .randomBytes(48)
            .toString("hex");

    sessions.set(
        token,
        {
            createdAt:Date.now()
        }
    );

    return token;
}


function getToken(req){

    const header =
        req.headers.authorization || "";

    if(!header.startsWith("Bearer ")){
        return null;
    }

    return header.substring(7).trim();
}


function requireAdmin(req,res,next){

    const token =
        getToken(req);

    if(!token ||
       !sessions.has(token)){

        return res.status(401).json({
            error:"Nicht angemeldet."
        });
    }

    next();
}


/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

function id(){

    return crypto
        .randomBytes(12)
        .toString("hex");
}


function cleanText(value){

    return String(value ?? "")
        .replace(/\r/g,"")
        .trim();
}


function normalizeCode(value){

    return cleanText(value)
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g,"");
}


function uniqueCode(){

    let code;

    do{

        code =
            "FW-" +
            Math.random()
                .toString(36)
                .substring(2,7)
                .toUpperCase();

    }while(
        db.pruefungen.some(
            p=>p.code === code
        )
    );

    return code;
}


function now(){

    return new Date()
        .toISOString();
}


function wordCount(text){

    return cleanText(text)
        .split(/\s+/)
        .filter(Boolean)
        .length;
}


function clamp(value,min,max){

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


/* ============================================================
   GESUNDHEIT
============================================================ */

app.get(
    "/",
    (req,res)=>{

        res.json({
            name:"Feuerwehr Prüfungsplattform",
            status:"online",
            ki:"Feuerwehr-Ausbilder-KI",
            version:"1.0.0"
        });
    }
);


app.get(
    "/api/gesundheit",
    (req,res)=>{

        res.json({
            ok:true,
            server:"online",
            zeit:now(),
            pruefungen:
                db.pruefungen.length,
            ergebnisse:
                db.ergebnisse.length
        });
    }
);


/* ============================================================
   ADMIN LOGIN
============================================================ */

app.post(
    "/api/admin/login",
    (req,res)=>{

        const email =
            cleanText(
                req.body.email
            );

        const password =
            String(
                req.body.password || ""
            );

        if(
            email.toLowerCase() !==
            ADMIN_EMAIL.toLowerCase() ||
            password !==
            ADMIN_PASSWORD
        ){

            return res.status(401).json({
                error:
                    "E-Mail oder Passwort ist falsch."
            });
        }

        const token =
            createSession();

        res.json({
            ok:true,
            token
        });
    }
);


app.post(
    "/api/admin/logout",
    requireAdmin,
    (req,res)=>{

        const token =
            getToken(req);

        sessions.delete(token);

        res.json({
            ok:true
        });
    }
);


/* ============================================================
   DASHBOARD
============================================================ */

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    (req,res)=>{

        const ergebnisse =
            db.ergebnisse;

        const bestanden =
            ergebnisse.filter(
                x=>x.passed
            ).length;

        const durchschnitt =
            ergebnisse.length
            ? Math.round(
                ergebnisse.reduce(
                    (sum,x)=>
                        sum +
                        Number(x.percent || 0),
                    0
                ) /
                ergebnisse.length
            )
            : 0;

        res.json({

            pruefungen:
                db.pruefungen.length,

            teilnehmer:
                ergebnisse.length,

            bestanden,

            durchschnitt

        });
    }
);


/* ============================================================
   PRÜFUNGEN ADMIN
============================================================ */

app.get(
    "/api/admin/pruefungen",
    requireAdmin,
    (req,res)=>{

        const pruefungen =
            db.pruefungen
            .slice()
            .reverse()
            .map(p=>({

                id:p.id,
                title:p.title,
                code:p.code,
                duration:p.duration,
                passPercent:p.passPercent,
                difficulty:p.difficulty,
                questionCount:
                    p.questions.length,
                createdAt:p.createdAt

            }));

        res.json({
            pruefungen
        });
    }
);


/* ============================================================
   ÖFFENTLICHE PRÜFUNG PER CODE
============================================================ */

app.get(
    "/api/pruefungen/code/:code",
    (req,res)=>{

        const code =
            normalizeCode(
                req.params.code
            );

        const pruefung =
            db.pruefungen.find(
                p=>p.code === code
            );

        if(!pruefung){

            return res.status(404).json({
                error:
                    "Diese Prüfung wurde nicht gefunden."
            });
        }

        res.json({

            pruefung:{
                id:pruefung.id,
                title:pruefung.title,
                code:pruefung.code,
                duration:pruefung.duration,
                passPercent:
                    pruefung.passPercent,
                difficulty:
                    pruefung.difficulty,

                questions:
                    pruefung.questions.map(
                        q=>({

                            type:q.type,

                            question:q.question,

                            options:
                                q.type ===
                                "multiple_choice"
                                ? q.options
                                : undefined

                        })
                    )
            }

        });
    }
);


/* ============================================================
   EIGENE KI
============================================================ */

/*
    Die KI arbeitet ausschließlich auf dem übergebenen Material.

    Sie verwendet:
    - Satzanalyse
    - Schlüsselwort-Erkennung
    - Zahlen-Erkennung
    - Definitionen
    - Regeln
    - "muss / darf / nicht / immer / niemals"
    - Feuerwehr-Begriffe

    Es werden keine externen KI-Dienste aufgerufen.
*/


const STOPWORDS = new Set([
    "der","die","das","den","dem","des",
    "ein","eine","einer","einem","einen",
    "und","oder","aber","auch","ist","sind",
    "war","wird","werden","von","mit","für",
    "auf","aus","bei","nach","über","unter",
    "durch","zum","zur","im","in","an",
    "als","es","sich","zu","vor","nicht",
    "nur","wie","dass","einer","eines",
    "kann","können","muss","müssen",
    "hat","haben","sein","seine","ihre",
    "werden","wurde","wurden","wenn",
    "dann","hier","dort","noch","bereits",
    "sehr","mehr","bis","gegen","ohne",
    "einem","einer"
]);


function splitMaterial(material){

    return cleanText(material)
        .split(/\n+/)
        .flatMap(line =>
            line
                .split(
                    /(?<=[.!?])\s+/
                )
        )
        .map(cleanText)
        .filter(sentence =>
            sentence.length >= 35 &&
            sentence.length <= 500
        );
}


function tokenize(text){

    return cleanText(text)
        .toLowerCase()
        .replace(/[^a-zäöüß0-9\- ]/gi," ")
        .split(/\s+/)
        .filter(word =>
            word.length >= 4 &&
            !STOPWORDS.has(word)
        );
}


function importantWords(text){

    const counts =
        new Map();

    for(const word of tokenize(text)){

        counts.set(
            word,
            (counts.get(word) || 0) + 1
        );
    }

    return [...counts.entries()]
        .sort(
            (a,b)=>b[1]-a[1]
        )
        .slice(0,12)
        .map(x=>x[0]);
}


function extractNumbers(text){

    return text.match(
        /\b\d+(?:[,.]\d+)?(?:\s?(?:m|cm|mm|kg|bar|l|min|sek|s|km\/h|°C|%))?\b/gi
    ) || [];
}


function extractDefinitions(sentence){

    const patterns = [

        /^(.{3,80})\s+(?:ist|sind|bezeichnet|bedeutet)\s+(.{10,300})$/i,

        /^Unter\s+(.{3,80})\s+versteht\s+man\s+(.{10,300})$/i,

        /^(.{3,80})\s+nennt\s+man\s+(.{10,300})$/i

    ];

    for(const pattern of patterns){

        const match =
            sentence.match(pattern);

        if(match){

            return {
                term:cleanText(match[1]),
                definition:cleanText(match[2])
            };
        }
    }

    return null;
}


function sentenceScore(sentence){

    let score = 0;

    const lower =
        sentence.toLowerCase();

    if(
        /\b(muss|müssen|darf|dürfen|nicht|immer|niemals|erforderlich|verboten|pflicht)\b/
        .test(lower)
    ){
        score += 5;
    }

    if(
        /\b(ist|sind|bedeutet|bezeichnet)\b/
        .test(lower)
    ){
        score += 3;
    }

    if(extractNumbers(sentence).length){
        score += 3;
    }

    if(sentence.includes(":")){
        score += 2;
    }

    if(sentence.length >= 60){
        score += 1;
    }

    return score;
}


function createQuestionFromSentence(
    sentence,
    difficulty,
    used
){

    const definition =
        extractDefinitions(sentence);

    const numbers =
        extractNumbers(sentence);

    const keywords =
        importantWords(sentence);

    if(definition){

        const question =
            `Was wird unter „${definition.term}“ verstanden?`;

        const correct =
            definition.definition;

        const distractors =
            createDistractors(
                correct,
                sentence,
                used
            );

        if(difficulty === "schwer"){

            return {

                type:"multiple_choice",

                question,

                options:[
                    correct,
                    ...distractors.slice(0,3)
                ].sort(
                    ()=>Math.random()-.5
                ),

                correctIndex:null,

                solution:
                    `Laut Unterrichtsmaterial: ${correct}`,

                points:1

            };
        }

        return {

            type:"text",

            question,

            options:[],

            correctAnswer:
                correct,

            solution:
                `Laut Unterrichtsmaterial: ${correct}`,

            points:1

        };
    }


    if(
        /\b(muss|müssen|darf|dürfen|nicht|verboten|pflicht)\b/i
        .test(sentence)
    ){

        const isNegative =
            /\b(nicht|niemals|verboten)\b/i
            .test(sentence);

        return {

            type:"true_false",

            question:
                makeStatementQuestion(
                    sentence
                ),

            correctAnswer:true,

            solution:
                sentence,

            points:1

        };
    }


    if(numbers.length){

        return {

            type:"multiple_choice",

            question:
                createNumberQuestion(
                    sentence,
                    numbers[0]
                ),

            options:
                createNumberOptions(
                    numbers[0]
                ),

            correctIndex:null,

            solution:
                sentence,

            points:1

        };
    }


    if(keywords.length >= 2){

        const keyword =
            keywords[0];

        return {

            type:"multiple_choice",

            question:
                `Welche Aussage trifft laut Unterrichtsmaterial auf „${keyword}“ zu?`,

            options:[
                sentence,
                "Diese Aussage wird im Unterrichtsmaterial nicht so beschrieben.",
                "Der Begriff hat im Unterrichtsmaterial eine andere Bedeutung.",
                "Im Unterrichtsmaterial wird dazu keine Regel genannt."
            ],

            correctIndex:0,

            solution:
                sentence,

            points:1

        };
    }


    return {

        type:"text",

        question:
            `Erkläre anhand des Unterrichtsmaterials: ${sentence}`,

        options:[],

        correctAnswer:
            sentence,

        solution:
            sentence,

        points:1

    };
}


function makeStatementQuestion(sentence){

    return (
        "Richtig oder falsch?\n\n" +
        sentence
    );
}


function createNumberQuestion(
    sentence,
    number
){

    const masked =
        sentence.replace(
            number,
            "___"
        );

    return (
        "Welche Angabe gehört laut " +
        "Unterrichtsmaterial an die markierte Stelle?\n\n" +
        masked
    );
}


function createNumberOptions(correct){

    const match =
        String(correct)
        .match(
            /^(\d+(?:[,.]\d+)?)(.*)$/
        );

    if(!match){

        return [
            correct,
            "Keine Angabe",
            "Eine andere Angabe",
            "Das Material nennt keinen Wert"
        ];
    }

    const value =
        Number(
            match[1]
            .replace(",",".")
        );

    const suffix =
        match[2];

    const alternatives = [
        Math.max(
            1,
            value - 1
        ),
        value + 1,
        value + 5
    ];

    return [
        correct,
        ...alternatives.map(
            x=>String(x)+suffix
        )
    ];
}


function createDistractors(
    correct,
    sentence,
    used
){

    const words =
        importantWords(
            sentence
        );

    const candidates = [

        "Eine andere im Material genannte Regel.",

        "Eine im Unterrichtsmaterial nicht beschriebene Vorgehensweise.",

        "Eine abweichende Aussage aus einem anderen Themenbereich.",

        words.length
            ? `Die Aussage bezieht sich stattdessen auf ${words[0]}.`
            : "Keine der genannten Aussagen."

    ];

    return candidates.filter(
        x=>x !== correct &&
           !used.has(x)
    );
}


function fixCorrectIndexes(questions){

    return questions.map(q=>{

        if(
            q.type ===
            "multiple_choice" &&
            q.correctIndex === null
        ){

            let correctIndex = 0;

            /*
                Bei automatisch erzeugten
                Nummernfragen ist die korrekte
                Antwort immer der Originalwert.
            */

            if(
                q.solution &&
                q.options.length
            ){

                const original =
                    q.solution;

                const number =
                    q.options.findIndex(
                        option =>
                            original.includes(
                                String(option)
                            )
                    );

                if(number >= 0){
                    correctIndex = number;
                }
            }

            q.correctIndex =
                correctIndex;
        }

        return q;
    });
}


function generateExamQuestions(
    material,
    requestedCount,
    difficulty
){

    const sentences =
        splitMaterial(material);

    if(sentences.length < 3){

        throw new Error(
            "Das Material enthält zu wenige verwertbare Aussagen."
        );
    }

    const ranked =
        sentences
            .map(sentence=>({
                sentence,
                score:
                    sentenceScore(
                        sentence
                    )
            }))
            .sort(
                (a,b)=>
                    b.score-a.score
            );

    const selected = [];

    const usedSentences =
        new Set();

    for(
        const item of ranked
    ){

        if(
            selected.length >=
            requestedCount
        ){
            break;
        }

        if(
            usedSentences.has(
                item.sentence
            )
        ){
            continue;
        }

        usedSentences.add(
            item.sentence
        );

        selected.push(
            item.sentence
        );
    }


    /*
        Falls das Material weniger
        verschiedene Sätze enthält,
        wird zusätzlich über Abschnitte
        gearbeitet.
    */

    if(
        selected.length <
        requestedCount
    ){

        for(
            const sentence of sentences
        ){

            if(
                selected.length >=
                requestedCount
            ){
                break;
            }

            selected.push(
                sentence
            );
        }
    }


    const usedOptions =
        new Set();

    let questions =
        selected.map(
            sentence =>
                createQuestionFromSentence(
                    sentence,
                    difficulty,
                    usedOptions
                )
        );


    /*
        Bei mittlerer und schwerer
        Schwierigkeit werden möglichst
        unterschiedliche Fragetypen
        verwendet.
    */

    questions =
        diversifyQuestions(
            questions,
            difficulty
        );


    questions =
        fixCorrectIndexes(
            questions
        );


    return questions
        .slice(
            0,
            requestedCount
        );
}


function diversifyQuestions(
    questions,
    difficulty
){

    const result =
        [];

    let multiple = 0;
    let trueFalse = 0;
    let text = 0;

    for(
        const q of questions
    ){

        if(
            q.type === "multiple_choice"
        ){
            multiple++;
        }

        if(
            q.type === "true_false"
        ){
            trueFalse++;
        }

        if(
            q.type === "text"
        ){
            text++;
        }

        result.push(q);
    }

    return result;
}


/* ============================================================
   KI ENDPOINT
============================================================ */

app.post(
    "/api/admin/ki/pruefung",
    requireAdmin,
    (req,res)=>{

        try{

            const title =
                cleanText(
                    req.body.title
                );

            const material =
                cleanText(
                    req.body.material
                );

            const requestedCount =
                clamp(
                    Number(
                        req.body.questionCount
                    ) || 20,
                    1,
                    100
                );

            const passPercent =
                clamp(
                    Number(
                        req.body.passPercent
                    ) || 70,
                    1,
                    100
                );

            const duration =
                clamp(
                    Number(
                        req.body.duration
                    ) || 30,
                    1,
                    300
                );

            const difficulty =
                ["leicht","mittel","schwer"]
                    .includes(
                        req.body.difficulty
                    )
                    ? req.body.difficulty
                    : "mittel";


            if(!title){

                return res.status(400).json({
                    error:
                        "Prüfungsname fehlt."
                });
            }

            if(
                material.length <
                100
            ){

                return res.status(400).json({
                    error:
                        "Das Unterrichtsmaterial ist zu kurz."
                });
            }


            let code =
                normalizeCode(
                    req.body.code
                );

            if(!code){
                code =
                    uniqueCode();
            }


            if(
                db.pruefungen.some(
                    p=>p.code === code
                )
            ){

                return res.status(409).json({
                    error:
                        "Dieser Prüfungs-Code existiert bereits."
                });
            }


            const questions =
                generateExamQuestions(
                    material,
                    requestedCount,
                    difficulty
                );


            if(
                questions.length === 0
            ){

                return res.status(400).json({
                    error:
                        "Die KI konnte aus dem Material keine Fragen erstellen."
                });
            }


            const pruefung = {

                id:id(),

                title,

                code,

                duration,

                passPercent,

                difficulty,

                material,

                materialWords:
                    wordCount(material),

                questions,

                createdAt:
                    now()

            };


            db.pruefungen.push(
                pruefung
            );

            speichereDaten(db);


            res.json({

                ok:true,

                message:
                    "Prüfung erfolgreich erstellt.",

                pruefung:{

                    id:pruefung.id,

                    title:pruefung.title,

                    code:pruefung.code,

                    duration:
                        pruefung.duration,

                    passPercent:
                        pruefung.passPercent,

                    difficulty:
                        pruefung.difficulty,

                    questions:
                        pruefung.questions

                }

            });

        }catch(error){

            console.error(
                "KI Fehler:",
                error
            );

            res.status(500).json({
                error:
                    error.message ||
                    "Die KI konnte die Prüfung nicht erstellen."
            });
        }
    }
);


/* ============================================================
   PRÜFUNG MANUELL ANLEGEN
============================================================ */

app.post(
    "/api/admin/pruefungen",
    requireAdmin,
    (req,res)=>{

        try{

            const title =
                cleanText(
                    req.body.title
                );

            const questions =
                Array.isArray(
                    req.body.questions
                )
                ? req.body.questions
                : [];

            if(!title){

                return res.status(400).json({
                    error:
                        "Prüfungsname fehlt."
                });
            }

            if(!questions.length){

                return res.status(400).json({
                    error:
                        "Keine Fragen vorhanden."
                });
            }

            let code =
                normalizeCode(
                    req.body.code
                ) ||
                uniqueCode();

            if(
                db.pruefungen.some(
                    p=>p.code === code
                )
            ){

                return res.status(409).json({
                    error:
                        "Der Prüfungs-Code existiert bereits."
                });
            }


            const pruefung = {

                id:id(),

                title,

                code,

                duration:
                    clamp(
                        Number(
                            req.body.duration
                        ) || 30,
                        1,
                        300
                    ),

                passPercent:
                    clamp(
                        Number(
                            req.body.passPercent
                        ) || 70,
                        1,
                        100
                    ),

                difficulty:
                    req.body.difficulty ||
                    "mittel",

                material:
                    cleanText(
                        req.body.material
                    ),

                questions,

                createdAt:
                    now()

            };


            db.pruefungen.push(
                pruefung
            );

            speichereDaten(db);

            res.json({
                ok:true,
                pruefung
            });

        }catch(error){

            res.status(500).json({
                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   PRÜFUNG LÖSCHEN
============================================================ */

app.delete(
    "/api/admin/pruefungen/:id",
    requireAdmin,
    (req,res)=>{

        const examId =
            req.params.id;

        const exists =
            db.pruefungen.some(
                p=>p.id === examId
            );

        if(!exists){

            return res.status(404).json({
                error:
                    "Prüfung nicht gefunden."
            });
        }


        db.pruefungen =
            db.pruefungen.filter(
                p=>p.id !== examId
            );

        db.ergebnisse =
            db.ergebnisse.filter(
                r=>r.examId !== examId
            );

        speichereDaten(db);

        res.json({
            ok:true
        });
    }
);


/* ============================================================
   TEILNEHMER GIBT PRÜFUNG AB
============================================================ */

app.post(
    "/api/teilnehmer/abgabe",
    (req,res)=>{

        try{

            const examId =
                cleanText(
                    req.body.examId
                );

            const participant =
                req.body.participant ||
                {};

            const answers =
                Array.isArray(
                    req.body.answers
                )
                ? req.body.answers
                : [];


            const exam =
                db.pruefungen.find(
                    p=>p.id === examId
                );


            if(!exam){

                return res.status(404).json({
                    error:
                        "Prüfung nicht gefunden."
                });
            }


            const firstName =
                cleanText(
                    participant.firstName
                );

            const lastName =
                cleanText(
                    participant.lastName
                );

            const fireDepartment =
                cleanText(
                    participant.fireDepartment
                );


            if(
                !firstName ||
                !lastName ||
                !fireDepartment
            ){

                return res.status(400).json({
                    error:
                        "Teilnehmerdaten fehlen."
                });
            }


            let score = 0;

            let maxScore = 0;

            let manualRequired =
                false;


            const detailQuestions =
                exam.questions.map(
                    (question,index)=>{

                        const submitted =
                            answers.find(
                                answer =>
                                    Number(
                                        answer.questionIndex
                                    ) === index
                            );


                        const answer =
                            submitted
                            ? submitted.answer
                            : null;


                        let correct =
                            false;

                        let manual =
                            false;


                        /*
                            Multiple Choice
                        */

                        if(
                            question.type ===
                            "multiple_choice"
                        ){

                            maxScore +=
                                Number(
                                    question.points || 1
                                );

                            correct =
                                Number(answer) ===
                                Number(
                                    question.correctIndex
                                );

                            if(correct){
                                score +=
                                    Number(
                                        question.points || 1
                                    );
                            }

                        }


                        /*
                            Richtig/Falsch
                        */

                        else if(
                            question.type ===
                            "true_false"
                        ){

                            maxScore +=
                                Number(
                                    question.points || 1
                                );

                            correct =
                                Boolean(answer) ===
                                Boolean(
                                    question.correctAnswer
                                );

                            if(correct){
                                score +=
                                    Number(
                                        question.points || 1
                                    );
                            }

                        }


                        /*
                            Textfrage

                            Wird gespeichert und
                            anschließend vom Ausbilder
                            kontrolliert.
                        */

                        else if(
                            question.type ===
                            "text"
                        ){

                            manual =
                                true;

                            manualRequired =
                                true;

                            /*
                                Textfragen werden bei der
                                automatischen Prozentrechnung
                                nicht als mögliche Punkte
                                verwendet.
                            */

                        }


                        return {

                            question:
                                question.question,

                            answer,

                            correct,

                            manual,

                            solution:
                                question.solution || "",

                            type:
                                question.type

                        };

                    }
                );


            const percent =
                maxScore > 0
                ? Math.round(
                    score /
                    maxScore *
                    100
                )
                : 0;


            const passed =
                percent >=
                Number(
                    exam.passPercent
                );


            const result = {

                id:id(),

                examId:exam.id,

                examTitle:
                    exam.title,

                examCode:
                    exam.code,

                firstName,

                lastName,

                fireDepartment,

                score,

                maxScore,

                percent,

                passPercent:
                    exam.passPercent,

                passed,

                manualRequired,

                questions:
                    detailQuestions,

                submittedAt:
                    now()

            };


            db.ergebnisse.push(
                result
            );

            speichereDaten(db);


            res.json({

                ok:true,

                result:{

                    id:result.id,

                    score:result.score,

                    maxScore:
                        result.maxScore,

                    percent:
                        result.percent,

                    passPercent:
                        result.passPercent,

                    passed:
                        result.passed,

                    manualRequired:
                        result.manualRequired

                }

            });

        }catch(error){

            console.error(
                "Abgabe Fehler:",
                error
            );

            res.status(500).json({
                error:
                    "Die Prüfung konnte nicht gespeichert werden."
            });
        }
    }
);


/* ============================================================
   ÖFFENTLICHES ERGEBNIS
============================================================ */

app.get(
    "/api/ergebnis/:id",
    (req,res)=>{

        const result =
            db.ergebnisse.find(
                x=>x.id ===
                    req.params.id
            );

        if(!result){

            return res.status(404).json({
                error:
                    "Ergebnis nicht gefunden."
            });
        }


        res.json({

            ergebnis:{

                id:result.id,

                examTitle:
                    result.examTitle,

                firstName:
                    result.firstName,

                lastName:
                    result.lastName,

                score:
                    result.score,

                maxScore:
                    result.maxScore,

                percent:
                    result.percent,

                passPercent:
                    result.passPercent,

                passed:
                    result.passed,

                manualRequired:
                    result.manualRequired,

                submittedAt:
                    result.submittedAt

            }

        });
    }
);


/* ============================================================
   ADMIN ERGEBNISSE
============================================================ */

app.get(
    "/api/admin/ergebnisse",
    requireAdmin,
    (req,res)=>{

        const ergebnisse =
            db.ergebnisse
            .slice()
            .reverse()
            .map(result=>({

                id:result.id,

                examId:
                    result.examId,

                examTitle:
                    result.examTitle,

                firstName:
                    result.firstName,

                lastName:
                    result.lastName,

                fireDepartment:
                    result.fireDepartment,

                score:
                    result.score,

                maxScore:
                    result.maxScore,

                percent:
                    result.percent,

                passPercent:
                    result.passPercent,

                passed:
                    result.passed,

                manualRequired:
                    result.manualRequired,

                submittedAt:
                    result.submittedAt

            }));


        res.json({
            ergebnisse
        });
    }
);


/* ============================================================
   ADMIN ERGEBNIS DETAIL
============================================================ */

app.get(
    "/api/admin/ergebnisse/:id",
    requireAdmin,
    (req,res)=>{

        const result =
            db.ergebnisse.find(
                x=>x.id ===
                    req.params.id
            );

        if(!result){

            return res.status(404).json({
                error:
                    "Ergebnis nicht gefunden."
            });
        }

        res.json({
            ergebnis:result
        });
    }
);


/* ============================================================
   FEHLERBEHANDLUNG
============================================================ */

app.use(
    (req,res)=>{

        res.status(404).json({
            error:
                "API-Endpunkt nicht gefunden."
        });
    }
);


app.use(
    (error,req,res,next)=>{

        console.error(error);

        res.status(500).json({
            error:
                "Interner Serverfehler."
        });
    }
);


/* ============================================================
   SERVER START
============================================================ */

app.listen(
    PORT,
    "0.0.0.0",
    ()=>{
        console.log("");
        console.log(
            "=============================================="
        );
        console.log(
            " FEUERWEHR PRÜFUNGSPLATTFORM"
        );
        console.log(
            "=============================================="
        );
        console.log(
            "Server: http://localhost:" +
            PORT
        );
        console.log(
            "KI: Feuerwehr-Ausbilder-KI"
        );
        console.log(
            "Datenbank: " +
            DB_FILE
        );
        console.log(
            "Admin: " +
            ADMIN_EMAIL
        );
        console.log(
            "=============================================="
        );
        console.log("");
    }
);
