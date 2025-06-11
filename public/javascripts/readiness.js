let surveyData = [];
let currentCategoryIndex = 0;
let currentQuestionIndex = 0;
let totalQuestionsCount = 0;
const answers = {};
let progressBar;

document.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("/helper/readiness-questions.json");
  surveyData = await res.json();
  totalQuestionsCount = surveyData.reduce(
    (sum, cat) => sum + cat.questions.length,
    0
  );
  document
    .getElementById("start-btn")
    .addEventListener("click", startAssessment);
  document.getElementById("next-btn").addEventListener("click", nextQuestion);
  document.getElementById("prev-btn").addEventListener("click", prevQuestion);
});

function startAssessment() {
  document.getElementById("readiness-section").style.display = "none";
  document.getElementById("assessment-section").style.display = "block";
  initProgressBar();
  currentQuestionIndex = 0;
  renderQuestion(currentCategoryIndex, currentQuestionIndex);
  renderCategoryProgressBars();
}

function initProgressBar() {
  progressBar = new ProgressBar.Line("#progressbar", {
    strokeWidth: 8,
    color: "#2563eb",
    trailColor: "#e5e7eb",
    trailWidth: 8,
    svgStyle: { width: "100%", height: "10px", borderRadius: "6px" },
    easing: "easeInOut",
    duration: 500,
  });
  updateProgress();
}

function updateProgress() {
  // Progress through categories, or optionally through questions too
  const progress = (currentCategoryIndex + 1) / surveyData.length;
  progressBar.animate(progress);
}

// Render only one question at a time in the current category
function renderQuestion(categoryIndex, questionIndex) {
  const section = document.getElementById("question-section");
  const category = surveyData[categoryIndex];
  const question = category.questions[questionIndex];

  document.getElementById("category-title").textContent = category.category;
  section.innerHTML = "";

  document.getElementById("question-progress").textContent = `Question ${
    questionIndex + 1
  } of ${category.questions.length}`;
  let questionGlobalIndex = 0;
  for (let i = 0; i < categoryIndex; i++) {
    questionGlobalIndex += surveyData[i].questions.length;
  }
  questionGlobalIndex += questionIndex + 1;
  document.getElementById(
    "total-progress"
  ).textContent = `(Total Question ${questionGlobalIndex} of ${totalQuestionsCount})`;

  const saved = answers[question.id];
  const div = document.createElement("div");
  div.className = "question-block";

  div.innerHTML = `
    <div class="question">
      <label><strong>${question.question}</strong></label>
      <p style="margin: 4px 0;">
  <small>${question.explanation}</small> 
  ${
    question.source && question.source.url && question.source.text
      ? `<a href="${question.source.url}" target="_blank" rel="noopener noreferrer">${question.source.text}</a>`
      : ""
  }
</p>
      <div class="options">
        ${question.answers
          .map(
            (a) => `
              <div class="custom-option ${saved === a.value ? "selected" : ""}" 
                   data-question="${question.id}" 
                   data-value="${a.value}">
                ${a.label}
              </div>`
          )
          .join("")}
      </div>
    </div>
  `;

  // Add event listeners for custom box clicks
  div.querySelectorAll(".custom-option").forEach((optionEl) => {
    optionEl.addEventListener("click", (e) => {
      const { question, value } = e.currentTarget.dataset;
      saveAnswer(question, value);
      validateQuestionAnswered();

      // Remove selection from others
      div
        .querySelectorAll(".custom-option")
        .forEach((el) => el.classList.remove("selected"));
      e.currentTarget.classList.add("selected");
    });
  });

  section.appendChild(div);

  // Update button states and text
  document.getElementById("prev-btn").disabled =
    questionIndex === 0 && categoryIndex === 0;
  const isLastQuestionInCategory =
    questionIndex === category.questions.length - 1;
  const isLastCategory = categoryIndex === surveyData.length - 1;

  if (isLastQuestionInCategory && isLastCategory) {
    document.getElementById("next-btn").textContent = "Finish Assessment";
  } else if (isLastQuestionInCategory) {
    document.getElementById("next-btn").textContent = "Next Category ➡";
  } else {
    document.getElementById("next-btn").textContent = "Next Question ➡";
  }

  // Initially disable next button if no answer
  validateQuestionAnswered();
  updateProgress();
}

// Save answer for the current question
function saveAnswer(id, value) {
  answers[id] = value;
}

// Enable next button only if current question answered
function validateQuestionAnswered() {
  const category = surveyData[currentCategoryIndex];
  const question = category.questions[currentQuestionIndex];
  const answered = answers[question.id];
  document.getElementById("next-btn").disabled = !answered;
}

function nextQuestion() {
  const category = surveyData[currentCategoryIndex];
  if (currentQuestionIndex < category.questions.length - 1) {
    // Move to next question in current category
    currentQuestionIndex++;
    renderQuestion(currentCategoryIndex, currentQuestionIndex);
  } else {
    // End of questions in current category, move to next category if any
    if (currentCategoryIndex < surveyData.length - 1) {
      currentCategoryIndex++;
      currentQuestionIndex = 0;
      renderQuestion(currentCategoryIndex, currentQuestionIndex);
    } else {
      showResults();
    }
  }
}

function prevQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderQuestion(currentCategoryIndex, currentQuestionIndex);
  } else if (currentCategoryIndex > 0) {
    // Move to previous category last question
    currentCategoryIndex--;
    const prevCategory = surveyData[currentCategoryIndex];
    currentQuestionIndex = prevCategory.questions.length - 1;
    renderQuestion(currentCategoryIndex, currentQuestionIndex);
  }
}

// RENDER RESULTS -------------------------

function showResults() {
  document.getElementById("assessment-section").style.display = "none";
  document.getElementById("progressbar").style.display = "none";
  document.getElementById("category-title").style.display = "none";
  const resultSection = document.getElementById("result-section");
  resultSection.style.display = "block";

  const scoreMap = {};
  let totalScore = 0;
  let maxScore = 0;

  surveyData.forEach((cat) => {
    cat.questions.forEach((q) => {
      const userAnswer = answers[q.id];
      const matchedAnswer = q.answers.find((a) => a.value === userAnswer);
      const maxAnswerWeight = Math.max(...q.answers.map((a) => a.weight));

      maxScore += q.weight * maxAnswerWeight;

      if (matchedAnswer) {
        totalScore += q.weight * matchedAnswer.weight;
        scoreMap[userAnswer] = (scoreMap[userAnswer] || 0) + 1;
      }
    });
  });

  const scorePercent = maxScore ? Math.round((totalScore / maxScore) * 100) : 0;

  const scoreBar = document.getElementById("score-bar");
  const scoreLabel = document.getElementById("score-label");

  scoreBar.style.width = scorePercent + "%";
  scoreLabel.textContent = scorePercent + "%";

  let color = "#ef4444"; // red by default
  if (scorePercent > 70) color = "#22c55e"; // green
  else if (scorePercent > 30) color = "#f59e0b"; // orange
  scoreBar.style.backgroundColor = color;

  // Render the additional result sections
  renderSummaryCharts();
  renderAnswerSummary();
  renderActionChecklist();
}

function renderSummaryCharts() {
  const radarCtx = document.getElementById("radar-chart").getContext("2d");

  const labels = [];
  const data = [];

  surveyData.forEach((cat) => {
    labels.push(cat.category);

    let totalScore = 0;
    let maxScore = 0;

    cat.questions.forEach((q) => {
      const userAnswer = answers[q.id];
      const matched = q.answers.find((a) => a.value === userAnswer);
      const maxAnswerWeight = Math.max(...q.answers.map((a) => a.weight));
      maxScore += q.weight * maxAnswerWeight;

      if (matched) {
        totalScore += q.weight * matched.weight;
      }
    });

    const percent = maxScore ? Math.round((totalScore / maxScore) * 100) : 0;
    data.push(percent);
  });

  new Chart(document.getElementById("radar-chart"), {
    type: "radar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Category Readiness (%)",
          data: data,
          fill: true,
          backgroundColor: "rgba(34,197,94,0.2)",
          borderColor: "#22c55e",
          pointBackgroundColor: "#22c55e",
          pointBorderColor: "#fff",
        },
      ],
    },
    options: {
      layout: {
        padding: 0, // remove internal padding
      },
      aspectRatio: 1,
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        r: {
          pointLabels: {
            font: { size: 12 },
            padding: 5,
          },
          ticks: {
            stepSize: 20,
            callback: (val) => val + "%",
            display: true,
            maxTicksLimit: 5,
          },
          grid: {
            circular: true,
            lineWidth: 1,
          },
        },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });
}

function renderAnswerSummary() {
  const wrapper = document.getElementById("answered-questions-wrapper");
  const list = document.getElementById("answered-questions-list");
  const toggleBtn = document.getElementById("toggle-summary-btn");

  list.innerHTML = "";
  wrapper.classList.remove("expanded"); // default to collapsed
  toggleBtn.textContent = "See More";

  const allItems = [];

  surveyData.forEach((cat) => {
    const catTitle = document.createElement("h4");
    catTitle.textContent = cat.category;
    allItems.push(catTitle);

    cat.questions.forEach((q) => {
      const userAnswer = answers[q.id];
      const label =
        q.answers.find((a) => a.value === userAnswer)?.label || "No answer";

      const item = document.createElement("p");
      item.innerHTML = `<strong>Q:</strong> ${q.question}<br><strong>Your Answer:</strong> ${label}`;
      allItems.push(item);
    });
  });

  allItems.slice(0, 4).forEach((el) => list.appendChild(el));

  let expanded = false;

  toggleBtn.onclick = () => {
    expanded = !expanded;
    list.innerHTML = ""; // clear

    if (expanded) {
      allItems.forEach((el) => list.appendChild(el));
      wrapper.classList.add("expanded");
      toggleBtn.textContent = "See Less";
    } else {
      allItems.slice(0, 4).forEach((el) => list.appendChild(el));
      wrapper.classList.remove("expanded");
      toggleBtn.textContent = "See More";
    }
  };
}

function renderActionChecklist() {
  const checklist = document.getElementById("action-checklist");
  const wrapper = document.getElementById("action-checklist-wrapper");
  const toggleBtn = document.getElementById("toggle-action-btn");

  checklist.innerHTML = "";
  toggleBtn.style.display = "none"; // Hide by default
  toggleBtn.textContent = "See More";

  const actionItems = [];

  surveyData.forEach((cat) => {
    cat.questions.forEach((q) => {
      const userAnswer = answers[q.id];
      const matchedAnswer = q.answers.find((a) => a.value === userAnswer);
      const maxWeight = Math.max(...q.answers.map((a) => a.weight));

      if (
        matchedAnswer &&
        matchedAnswer.weight < maxWeight &&
        matchedAnswer.action
      ) {
        actionItems.push({
          question: q.question,
          userAnswer: matchedAnswer.label,
          suggestion: matchedAnswer.action,
        });
      }
    });
  });

  if (actionItems.length === 0) {
    checklist.innerHTML = "<li>Great job! No urgent actions found.</li>";
    return;
  }

  // Split visible and hidden items
  const visibleCount = 2;
  const firstTwo = actionItems.slice(0, visibleCount);
  const remaining = actionItems.slice(visibleCount);

  // Render first two
  firstTwo.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>Q:</strong> ${item.question}<br>
      <strong>Your Answer:</strong> ${item.userAnswer}<br>
      <strong>Recommendation:</strong> <a href="${item.suggestion.url}" target="_blank">${item.suggestion.text}</a>
    `;
    checklist.appendChild(li);
  });

  // Render remaining (hidden by default)
  const hiddenContainer = document.createElement("div");
  hiddenContainer.id = "more-actions";
  hiddenContainer.style.display = "none";

  remaining.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>Q:</strong> ${item.question}<br>
      <strong>Your Answer:</strong> ${item.userAnswer}<br>
      <strong>Recommendation:</strong> <a href="${item.suggestion.url}" target="_blank">${item.suggestion.text}</a>
    `;
    hiddenContainer.appendChild(li);
  });

  if (remaining.length > 0) {
    checklist.appendChild(hiddenContainer);
    toggleBtn.style.display = "inline-block";

    toggleBtn.onclick = function () {
      const expanded = hiddenContainer.style.display === "block";
      hiddenContainer.style.display = expanded ? "none" : "block";
      toggleBtn.textContent = expanded ? "See More" : "See Less";
    };
  }
}
