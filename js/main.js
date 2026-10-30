document.addEventListener("DOMContentLoaded", function () {
    const regexInput = document.getElementById("regexInput");
    const convertBtn = document.getElementById("convertBtn");
    const errorMessage = document.getElementById("errorMessage");
    const processingSection = document.getElementById("processingSection");
    const nfaSection = document.getElementById("nfaSection");
    const tokensOutput = document.getElementById("tokensOutput");
    const concatenatedOutput = document.getElementById("concatenatedOutput");
    const postfixOutput = document.getElementById("postfixOutput");
    const stateCount = document.getElementById("stateCount");
    const alphabetOutput = document.getElementById("alphabetOutput");
    const startStateOutput = document.getElementById("startStateOutput");
    const finalStateOutput = document.getElementById("finalStateOutput");
    const transitionBody = document.getElementById("transitionBody");

    // Display error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove("hidden");
        processingSection.classList.add("hidden");
        nfaSection.classList.add("hidden");
    }

    // Clear error message
    function clearError() {
        errorMessage.textContent = "";
        errorMessage.classList.add("hidden");
    }

    // Clear previous results
    function clearResults() {
        processingSection.classList.add("hidden");
        nfaSection.classList.add("hidden");
        tokensOutput.textContent = "";
        concatenatedOutput.textContent = "";
        postfixOutput.textContent = "";
        transitionBody.replaceChildren();
        document.getElementById("nfaGraph").replaceChildren();
    }

    // Display transition table
    function displayTransitions(transitions) {
        transitionBody.replaceChildren();
        transitions.forEach(function (transition) {

            const row = document.createElement("tr");
            const fromCell = document.createElement("td");
            const symbolCell = document.createElement("td");
            const toCell = document.createElement("td");

            fromCell.textContent = transition.from;
            symbolCell.textContent = transition.symbol;
            toCell.textContent = transition.to;

            row.appendChild(fromCell);
            row.appendChild(symbolCell);
            row.appendChild(toCell);

            transitionBody.appendChild(row);
        });
    }

    // Main conversion function
    function convertRegex() {
        clearError();
        clearResults();

        const regex = regexInput.value.trim();

        // Check empty input
        if (regex.length === 0) {
            showError("Please enter a regular expression.");
            regexInput.focus();
            return;
        }

        try {
            const parsed = parseRegex(regex);
            const nfa = buildThompsonNFA(parsed.postfix);

            tokensOutput.textContent = JSON.stringify(parsed.tokens);
            concatenatedOutput.textContent = JSON.stringify(parsed.concatenated);
            postfixOutput.textContent = JSON.stringify(parsed.postfix);
            processingSection.classList.remove("hidden");
            stateCount.textContent = nfa.states.length;
            alphabetOutput.textContent = nfa.alphabet.length > 0 ? nfa.alphabet.join(", ") : "∅";
            startStateOutput.textContent = nfa.startState;
            finalStateOutput.textContent = nfa.acceptState;
            nfaSection.classList.remove("hidden");
            
            renderNFA(nfa, "nfaGraph");
            displayTransitions(nfa.transitions);
        } 
        catch (error) {
            showError(error.message);
        }

    }

    convertBtn.addEventListener("click", convertRegex);

    regexInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            convertRegex();
        }
    });

});