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

---

**Line 33** — `WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "dev-secret")`
> **Security:** The `"dev-secret"` fallback means the app silently accepts forged signatures in any environment where this env var isn't explicitly set. There should be no default — raise a `RuntimeError` at startup if `WEBHOOK_SECRET` is absent so misconfiguration is immediately visible rather than exploitable.

---

**Lines 34–35** — `def get_db(): return sqlite3.connect(DB_PATH)`
> **Performance:** A new connection is opened on every request and never closed. Under load this leaks file descriptors. Use Flask's `g` object to scope the connection to the request lifetime, and register a `teardown_appcontext` handler to close it.

---

**Lines 39–41** — `hashlib.sha256((WEBHOOK_SECRET + body.decode(...)).encode(...)).hexdigest()`
> **Security:** `SHA256(secret || body)` is not a secure MAC — it is vulnerable to length-extension attacks. The correct construction is HMAC-SHA256. Replace with `hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()`.

---

**Line 42** — `return expected == sig`
> **Security:** Standard string equality short-circuits on the first mismatched byte, leaking timing information an attacker can use to brute-force the signature. Use `hmac.compare_digest(expected, sig)` instead.

---

**Line 52** — `payload = json.loads(raw.decode("utf-8"))`
> **Accuracy:** A malformed body raises `json.JSONDecodeError`, which Flask surfaces as an unhandled 500. Wrap this in a `try/except` and return a 400 with a descriptive message so callers get an actionable response.

---

**Lines 56–57** — `email = payload.get("email", "")` / `role = payload.get("role", "user")`
> **Accuracy / Security:** Two problems here:
> 1. `role` is accepted as any arbitrary string from the vendor with no allowlist. An attacker with a valid signature could write `"superadmin"` or any other value directly into the users table. Validate against an explicit set of permitted roles.
> 2. The `metadata` field specified in the task requirements is silently discarded. If it carries business-relevant data (e.g., `source`), this is data loss. Either store it or explicitly document that it is intentionally ignored.

---

**Lines 63–65** — `f"INSERT INTO webhook_audit(email, raw_json) VALUES ('{email}', '{raw.decode('utf-8')}')"` 
> **Security (Critical):** This is a SQL injection vulnerability. Both `email` and the raw payload body are user-controlled and interpolated directly into the query string. An attacker who controls the payload can execute arbitrary SQL. Use a parameterized query: `cur.execute("INSERT INTO webhook_audit(email, raw_json) VALUES (?, ?)", (email, raw.decode("utf-8")))`.

---

**Lines 68–70** — `f"INSERT INTO users(email, role) VALUES('{email}', '{role}')"`
> **Security (Critical) / Accuracy:** Same SQL injection issue as above — must use parameterized queries. Additionally, this is a plain `INSERT`, not an upsert as the task requires. If `email` has a `UNIQUE` constraint this will throw an unhandled exception on duplicate events; if it doesn't, duplicate rows are silently created. Use `INSERT INTO users(email, role) VALUES(?, ?) ON CONFLICT(email) DO UPDATE SET role=excluded.role` with bound parameters.

---

**Lines 59–73** — *(entire db block)*
> **Performance:** There is no error handling around the database operations. If an exception occurs after `get_db()` but before `db.commit()`, the connection is leaked and the transaction is left open. Wrap the block in a `try/finally` (or use a context manager) to ensure `db.close()` is always called.

------------------------------------------------------------------------

## Follow-up Questions

1.  Share your prompts and the AI outputs.
2.  For each prompt:
    -   Tell us what you were hoping for the AI to accomplish.
    -   Tell us what it actually did.
    -   Did you have to re-prompt it based on its output?
    -   If you had to change your approach, why?

Prompt:

"please read through app.py and consider the context in the commented out instructions. given that this code was submitted as a PR with the mentioned requirements for the webhook, find any potential issues and comment on why they are problematic in terms of accuracy, performance, and security"

Claude Sonnet 4.6 Response: 

"
Security Issues
1. SQL Injection (Critical) — app.py:63-70
Both SQL statements use f-string interpolation directly with user-controlled data (email, role, and raw). An attacker who can send any request with a valid signature (or bypass it) can execute arbitrary SQL. The raw field is especially dangerous since it's the entire unvalidated payload inserted as a string.

Fix: Use parameterized queries (? placeholders with tuples).

2. Timing Attack on Signature Verification — app.py:42
expected == sig is a standard Python string comparison that short-circuits on the first mismatched byte, leaking timing information. An attacker can measure response times to brute-force the signature byte-by-byte.

Fix: Use hmac.compare_digest(expected, sig).

3. Signature Scheme Is Weak (Not HMAC) — app.py:39-41
SHA256(secret + body) is a length-extension attack surface. The correct construction for a keyed MAC is HMAC-SHA256(secret, body). Most webhook vendors (Stripe, GitHub, etc.) use HMAC.

Fix: Use hmac.new(secret.encode(), body, hashlib.sha256).hexdigest().

4. Hardcoded Fallback Secret — app.py:33
WEBHOOK_SECRET defaults to "dev-secret". If this ever reaches production without the env var set, all signatures are trivially forgeable. There should be no default; the app should fail to start if the secret is missing.

5. No Input Validation on role — app.py:57
role is taken directly from the payload with no allowlist. A vendor could send role: "superadmin" or any arbitrary string and it gets written to the users table without question.

Accuracy Issues
6. Upsert Is Not an Upsert — app.py:68-70
The task says "upsert the user data" but the query is a plain INSERT. If the email already exists and has a UNIQUE constraint, this throws an unhandled exception and returns a 500. If there's no constraint, it silently creates a duplicate row. It should be INSERT OR REPLACE or INSERT ... ON CONFLICT(email) DO UPDATE SET role=excluded.role.

7. Unhandled json.loads Exception — app.py:52
If the body is malformed JSON, json.loads raises json.JSONDecodeError, which Flask will surface as a 500. The audit record also won't be written. Malformed payloads should return a 400.

8. metadata Field Is Silently Dropped — app.py:56-57
The task specifies a metadata field (e.g., {"source":"vendor"}). The code reads only email and role and discards metadata entirely. Depending on requirements, this may be a data loss bug.

Performance Issues
9. No Connection Pooling — app.py:34-35
get_db() opens a new sqlite3.connect() on every request and never closes it (no db.close() call, no context manager). Under any meaningful load this leaks file descriptors and connections. Use Flask's g object or a connection pool.

10. No db.close() on Error Path — app.py:59-73
If an exception occurs between db = get_db() and db.commit(), the connection is abandoned. A try/finally or context manager is needed to ensure cleanup.

Summary Table
#	Issue	Category	Severity
1	SQL injection via f-strings	Security	Critical
2	Timing-safe comparison missing	Security	High
3	SHA256(secret+body) vs HMAC	Security	High
4	Hardcoded fallback secret	Security	High
5	No role allowlist	Security	Medium
6	INSERT instead of upsert	Accuracy	High
7	Unhandled JSON parse error	Accuracy	Medium
8	metadata silently dropped	Accuracy	Low–Medium
9	No DB connection pooling/close	Performance	Medium
10	No cleanup on error path	Performance	Medium
"

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

Prompt:

"i need to create a claculator web application. since there aren't any expectations beyond that I want to build a clean modern calculator web application using javascript for the backend/calculation logic, html for the webpage structure, and css to style and design the html. the calculator should be four function (add, subtract, multiply, and divide). it should also be able to handle division by zero which should show "undefned". you can use files index.html, script.js, and styles.css to create it, please use a darker color theme and add colors that pop for the function buttons (+,-,*,/,=)."

Response from Claude Sonnet 4.6 after updating index.html, styles.css, and script.js:

"
All three files are written. Here's what was built:

index.html — Standard calculator grid layout with a 4×5 keypad. The zero button spans two columns. Operator and equals buttons have dedicated classes for distinct styling.

styles.css — Dark theme (#0f0f0f body, #1a1a1a calculator shell, #111 display). Each operator button has a distinct pop color:

÷ — amber/yellow
× — red
− — cyan
+ — green
= — purple-to-pink gradient
script.js — Pure JS state machine tracking currentValue, storedValue, pendingOperator, and flags for chained operations and post-equals behavior. Division by zero returns null from calculate(), which formatNumber() converts to "undefined". Also includes:

Keyboard support (digits, operators, Enter, Escape, Backspace)
Active operator highlight (outlined in the operator's own color)
Auto-shrinking display font for long numbers
"

Prompt 2:

"
lets change the floating point display so it doesnt show unneeded trailing zeroes, and allow for chaining multiple operations using PEMDAS as a ruleset. also standardize the UI. all the function buttons should be the same color, the = button can be different, you can also add some subtle animations.
"

Response:

"
Here's what changed across both files:

script.js — Logic overhaul

Replaced the pairwise storedValue/pendingOperator state with a tokens[] array that accumulates the full expression (e.g. [2, '+', 3, '*', 4])
evaluate() does two passes: first resolves all * and / left-to-right, then resolves + and - — proper PEMDAS
formatNumber() now uses parseFloat(n.toPrecision(12)).toString(), which inherently strips trailing zeros since parseFloat normalizes them. 0.1 + 0.2 now displays 0.3
Pressing an operator mid-chain without typing a new number replaces the pending operator instead of evaluating prematurely
Display's pop class is removed and re-added each update to retrigger the slide-up animation
styles.css — Visual standardization

Removed all per-operator color selectors ([data-op="/"] etc.)
All four operator buttons are now a uniform steel blue (#5ba4f5 on #1c2b3a), with an inset border glow when active
= button is now a muted green (#5fd068 on #2a4a2a) — distinct but not loud
Added @keyframes popIn — a 6px slide-up + opacity fade on every display update
Button press uses scale(0.92) with transition on the base class for a consistent, smooth feel across all button types
"

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
## Answers

1. I was able to finish the exercise with a visually pleasing four function calculator.
2. The only issue was ensuring that the calculator was able to handle division by zero displaying undefined.
3. If I had unlimited time I would also add the ability to use exponents, square root, specified root, EE (enter exponent) for scientific notation, and other functionality to make the calculator more of a scientific calculator rather than just four function.
4. All prompt and responses I received from Claude are included above under the Exercise section. I believe that the AI did well with creating exactly what I said, but that is inherintly the issue. It didn't fill in the blanks to create an overall better product, or in this case, calculator. It created a functional basic calculator that can handle four basic functions. The AI was not able to go beyond this scope on its own. It had a few faults with creating the UI. With the first prompt it felt cluttered and almost oversimplified. This is a major fault of all models right now in my opinion. While AI can replicate currently existing web development practices, it struggles to innovate or even be critical of its own design without outside input. I was able to see what it created and immediately see what was wrong with it. I changed my approach by trying to be as specific as possible with what exactly I wanted in the areas that it mattered the most, and more vague in areas that weren't as important or that I didnt exactly know what I wanted yet (e.g. animations).