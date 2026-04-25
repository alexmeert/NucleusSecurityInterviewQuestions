const display = document.getElementById('result');
const expression = document.getElementById('expression');
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };

// State: tokens alternates [number, op, number, op, ...]
let tokens = [];
let currentValue = '0';
let awaitingOperand = false;
let justEvaluated = false;

function applyOp(a, op, b) {
    if (a === null || b === null) return null;
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? null : a / b;
    }
}

function evaluate(toks) {
    const values = toks.filter((_, i) => i % 2 === 0).slice();
    const ops    = toks.filter((_, i) => i % 2 === 1).slice();

    // First pass: * and /  (PEMDAS)
    let i = 0;
    while (i < ops.length) {
        if (ops[i] === '*' || ops[i] === '/') {
            const res = applyOp(values[i], ops[i], values[i + 1]);
            if (res === null) return null;
            values.splice(i, 2, res);
            ops.splice(i, 1);
        } else {
            i++;
        }
    }

    // Second pass: + and -
    let result = values[0];
    for (let j = 0; j < ops.length; j++) {
        result = applyOp(result, ops[j], values[j + 1]);
        if (result === null) return null;
    }
    return result;
}

function formatNumber(n) {
    if (n === null) return 'undefined';
    const precise = parseFloat(n.toPrecision(12));
    if (!isFinite(precise)) return 'undefined';
    if (Math.abs(precise) >= 1e12 || (precise !== 0 && Math.abs(precise) < 1e-7)) {
        return precise.toExponential(4);
    }
    return precise.toString(); // parseFloat strips trailing zeros
}

function formatExpression(toks, withEquals = false) {
    const str = toks.map((t, i) => i % 2 === 1 ? SYM[t] : formatNumber(t)).join(' ');
    return withEquals ? str + ' =' : str;
}

function setActiveOperator(op) {
    document.querySelectorAll('.btn-operator').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.op === op);
    });
}

function clearActiveOperator() {
    document.querySelectorAll('.btn-operator').forEach(btn => btn.classList.remove('active'));
}

function updateDisplay(value) {
    display.textContent = value;
    display.classList.toggle('small', value.length > 9);
    display.classList.remove('pop');
    void display.offsetWidth; // force reflow to retrigger animation
    display.classList.add('pop');
}

// Digit / decimal input
document.querySelectorAll('.btn-digit').forEach(btn => {
    btn.addEventListener('click', () => {
        const digit = btn.dataset.digit;

        if (justEvaluated) {
            tokens = [];
            currentValue = digit === '.' ? '0.' : digit;
            justEvaluated = false;
            clearActiveOperator();
            expression.textContent = '';
            updateDisplay(currentValue);
            return;
        }

        if (awaitingOperand) {
            currentValue = digit === '.' ? '0.' : digit;
            awaitingOperand = false;
        } else {
            if (digit === '.' && currentValue.includes('.')) return;
            currentValue = currentValue === '0' && digit !== '.' ? digit : currentValue + digit;
        }

        if (tokens.length > 0) expression.textContent = formatExpression(tokens);
        updateDisplay(currentValue);
    });
});

// Operator buttons
document.querySelectorAll('.btn-operator').forEach(btn => {
    btn.addEventListener('click', () => {
        const op = btn.dataset.op;

        if (awaitingOperand && tokens.length > 0) {
            // Replace the pending operator without pushing a new operand
            tokens[tokens.length - 1] = op;
        } else {
            const current = parseFloat(currentValue);
            if (justEvaluated) {
                tokens = [current];
                justEvaluated = false;
            } else {
                tokens.push(current);
            }
            tokens.push(op);
        }

        awaitingOperand = true;
        setActiveOperator(op);
        expression.textContent = formatExpression(tokens);
    });
});

// Equals
document.getElementById('btn-equals').addEventListener('click', () => {
    if (tokens.length === 0 || awaitingOperand) return;

    const fullTokens = [...tokens, parseFloat(currentValue)];
    const result = evaluate(fullTokens);

    expression.textContent = formatExpression(fullTokens, true);
    currentValue = formatNumber(result);
    tokens = [];
    awaitingOperand = false;
    justEvaluated = true;
    clearActiveOperator();
    updateDisplay(currentValue);
});

// Clear
document.getElementById('btn-clear').addEventListener('click', () => {
    tokens = [];
    currentValue = '0';
    awaitingOperand = false;
    justEvaluated = false;
    clearActiveOperator();
    expression.textContent = '';
    updateDisplay('0');
});

// +/-
document.getElementById('btn-sign').addEventListener('click', () => {
    if (currentValue === 'undefined') return;
    currentValue = formatNumber(parseFloat(currentValue) * -1);
    updateDisplay(currentValue);
});

// %
document.getElementById('btn-percent').addEventListener('click', () => {
    if (currentValue === 'undefined') return;
    currentValue = formatNumber(parseFloat(currentValue) / 100);
    updateDisplay(currentValue);
});

// Keyboard support
document.addEventListener('keydown', e => {
    if (e.key >= '0' && e.key <= '9') {
        document.querySelector(`.btn-digit[data-digit="${e.key}"]`)?.click();
    } else if (e.key === '.') {
        document.querySelector('.btn-digit[data-digit="."]')?.click();
    } else if (['+', '-', '*', '/'].includes(e.key)) {
        document.querySelector(`.btn-operator[data-op="${e.key}"]`)?.click();
    } else if (e.key === 'Enter' || e.key === '=') {
        document.getElementById('btn-equals').click();
    } else if (e.key === 'Escape') {
        document.getElementById('btn-clear').click();
    } else if (e.key === 'Backspace') {
        if (justEvaluated || awaitingOperand) return;
        currentValue = currentValue.length > 1 ? currentValue.slice(0, -1) : '0';
        updateDisplay(currentValue);
    }
});
