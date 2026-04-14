# Engineering Intern Interview Questions

## Introduction

Thank you for your interest in the Nucleus Security Engineering
internship program! This document contains 2 primary interview
challenges for you. The first is a code review question, and the second
is a coding challenge.

For both, we absolutely encourage the use of AI. If you do use AI, we
would like for you to share your prompts and then answer the follow-up
questions about how you thought through your prompts.

We know this time of the year is crazy for college students and that
your time is very valuable. Please try not to spend more than about 1
total hour collectively on this.

------------------------------------------------------------------------

## Contents

-   Introduction
-   Code Review (10 minutes)
    -   Task
    -   PHP
    -   Python
    -   Code comments
    -   Follow-up Questions
-   Coding Challenge (\~50 minutes)
    -   Exercise
    -   Follow-up questions
-   Delivery

------------------------------------------------------------------------

# Code Review (10 minutes)

You are welcome and encouraged to use AI for this section. If you do,
please provide your prompts and answer the questions in the follow-up
section.

## Task

Your colleague or team member was given the following task:

1.  Add a `/webhook` endpoint to receive vendor events about users who
    are vendors.

2.  Input data will look like:

    ``` json
    {"email":"a@b.com","role":"admin","metadata":{"source":"vendor"}}
    ```

3.  Verify signature header `X-Signature`.

4.  Parse JSON and upsert the user data.

5.  Store the raw payload for audit/debug.

They have opened a PR with the code below. Review the code and comment
on any issues you find.

**Note:** Both the PHP and Python do the same thing. You can choose to
review whichever one you want. It is not intended for you to review
both.

------------------------------------------------------------------------

## PHP

``` php
<?php
// webhook.php
require_once "db.php"; // provides $pdo (PDO instance)

// Config (dev defaults)
$WEBHOOK_SECRET = getenv("WEBHOOK_SECRET") ?: "dev-secret";
$DB_AUDIT_ENABLED = getenv("AUDIT_ENABLED") ?: "true";

function verify_signature($sig, $body, $secret) {
    // Vendor docs: SHA256(secret + body)
    $expected = hash("sha256", $secret . $body);
    return $expected == $sig; // simple compare
}

$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

// Basic routing
if ($method !== "POST" || $path !== "/webhook") {
    http_response_code(404);
    echo "not found";
    exit;
}

$raw = file_get_contents("php://input"); // raw body string
$sig = $_SERVER["HTTP_X_SIGNATURE"] ?? "";

if (!verify_signature($sig, $raw, $WEBHOOK_SECRET)) {
    http_response_code(401);
    echo "bad sig";
    exit;
}

// Decode JSON
$payload = json_decode($raw, true);
$email = $payload["email"] ?? "";
$role = $payload["role"] ?? "user";

// Store raw payload for auditing / debugging
if ($DB_AUDIT_ENABLED) {
    $pdo->exec("INSERT INTO webhook_audit(email, raw_json) VALUES ('$email', '$raw')");
}

// Upsert user (simple)
$pdo->exec("INSERT INTO users(email, role) VALUES('$email', '$role')");

echo "ok";
```

------------------------------------------------------------------------

## Python

``` python
# app.py
import os
import json
import sqlite3
import hashlib
from flask import Flask, request

app = Flask(__name__)
DB_PATH = os.getenv("DB_PATH", "/tmp/app.db")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "dev-secret")  # default for dev

def get_db():
    return sqlite3.connect(DB_PATH)

def verify(sig, body: bytes) -> bool:
    # Vendor docs: SHA256(secret + body)
    expected = hashlib.sha256(
        (WEBHOOK_SECRET + body.decode("utf-8")).encode("utf-8")
    ).hexdigest()
    return expected == sig  # simple compare

@app.post("/webhook")
def webhook():
    raw = request.data  # bytes
    sig = request.headers.get("X-Signature", "")

    if not verify(sig, raw):
        return ("bad sig", 401)

    payload = json.loads(raw.decode("utf-8"))

    # Example payload:
    # {"email":"a@b.com","role":"admin","metadata":{"source":"vendor"}}
    email = payload.get("email", "")
    role = payload.get("role", "user")

    db = get_db()
    cur = db.cursor()

    # Store raw payload for auditing / debugging
    cur.execute(
        f"INSERT INTO webhook_audit(email, raw_json) VALUES ('{email}', '{raw.decode('utf-8')}')"
    )

    # Upsert user
    cur.execute(
        f"INSERT INTO users(email, role) VALUES('{email}', '{role}')"
    )

    db.commit()

    return ("ok", 200)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
```

------------------------------------------------------------------------

## Code comments

Put your code comments here. For comments on specific lines, please
include the line number. Feel free to comment on the general task as
well.

------------------------------------------------------------------------

## Follow-up Questions

1.  Share your prompts and the AI outputs.
2.  For each prompt:
    -   Tell us what you were hoping for the AI to accomplish.
    -   Tell us what it actually did.
    -   Did you have to re-prompt it based on its output?
    -   If you had to change your approach, why?

------------------------------------------------------------------------

# Coding Challenge (\~50 minutes)

For the below coding exercise, there is no expectation that you will
have a fully working solution. For anything you feel you didn't
accomplish, please let us know in the follow-up section after the
exercise.

## Exercise

Build a calculator web application. It should include a frontend piece
and any backend logic needed to perform the calculations.

You can use any language of your choosing for both the frontend and
backend code.

------------------------------------------------------------------------

## Follow-up questions

1.  How far were you able to get with the exercise?
2.  What challenges did you encounter in the process?
3.  If you were given unlimited time, what additional functionality
    would you include?
4.  If you used AI, please include all of your prompts and answer the
    following questions:
    -   What did the AI do well?
    -   What did the AI do poorly?
    -   For the places it did poorly, how did you change your approach
        to your prompts to improve its output?

------------------------------------------------------------------------

# Delivery

Please reply to the email you received with:

1.  Answers to any follow-up above.
2.  Any questions or thoughts you had on the exercise.
3.  A link to a public GitHub repository including your answer to the
    coding challenge.
    -   If we can't get to the repository, we won't be able to consider
        your answer to the coding challenge.
