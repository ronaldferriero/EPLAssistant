const vendorLabels = {
  bluebeam: "Bluebeam",
  digeplan: "DigEplan",
  general: "General",
};

const roleLabels = {
  admin: "Administrator",
  coordinator: "Coordinator",
  reviewer: "Reviewer",
};

const suggestedQuestions = {
  general: [
    "How do I set up fees in EPL?",
    "How do I set up contact types?",
    "How do I manage a review?",
    "How do I reassign a review?",
    "How do I set up a review in the software?",
    "How do I set up Review Coordinator?",
  ],
  bluebeam: [
    "How do I set up eReviews with Bluebeam?",
    "How do I manage a review?",
    "How do I reassign a review?",
    "What if a user forgot their Bluebeam password?",
  ],
  digeplan: [
    "How do I set up DigEplan?",
    "How do I set up DigEplan SSO?",
    "How do reviewers work in DigEplan?",
    "How do coordinators manage DigEplan reviews?",
  ],
};

const roleSuggestedQuestions = {
  admin: [
    "How do I set up fees in EPL?",
    "How do I set up contact types?",
    "How do I set up Review Coordinator?",
  ],
  coordinator: [
    "How do I work a Review New Files task?",
    "How do I set up Review Coordinator?",
  ],
  reviewer: [
    "How do I manage a review?",
    "How do I reassign a review?",
    "How do reviewers add corrections and recommendations?",
  ],
};

const synonymMap = {
  bluebeam: ["bluebeam", "revu", "studio", "session"],
  digeplan: ["digeplan", "project"],
  sso: ["sso", "single sign on", "okta", "corpdev", "identity", "login"],
  onboarding: ["onboarding", "implement", "implementation", "go live"],
  migration: ["migration", "migrate", "switch", "cutover", "live client"],
  resubmittal: ["resubmittal", "resubmit", "resubmission", "submit again"],
  correction: ["correction", "corrections", "issue", "issues"],
  recommendation: ["recommendation", "recommendations", "notes"],
  review: ["review", "reviews", "reviewer", "reviewers"],
  coordinator: ["coordinator", "intake", "review coordinator"],
  setup: ["setup", "configure", "configuration", "prerequisite", "install"],
  team: ["team", "teams", "team lead", "assignment"],
  workflow: ["workflow", "step", "action", "template"],
  attachment: ["attachment", "attachments", "file", "files"],
  markup: ["markup", "markups", "comment", "comments", "annotate", "annotation"],
  dashboard: ["dashboard", "summary", "tile", "chart"],
};

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "do",
  "for",
  "how",
  "i",
  "in",
  "is",
  "me",
  "my",
  "of",
  "or",
  "the",
  "to",
  "we",
  "what",
  "with",
]);

const state = {
  vendor: "",
  role: "",
  kb: null,
  pendingUserMessage: null,
};

const guideIdAliases = {
  "review-management-setup": "review-management",
  "workflow-setup": "workflow",
  "manage-my-reviews-digeplan": "manage-my-reviews-dig-eplan",
};

const suggestionUsageStorageKey = "epl-assistant-suggestion-usage-v1";
const answerFeedbackStorageKey = "epl-assistant-answer-feedback-v1";

const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question");
const suggestions = document.querySelector("#suggestions");

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token));
}

function expandTokens(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const [root, variants] of Object.entries(synonymMap)) {
      if (variants.includes(token) || token === root) {
        expanded.add(root);
        variants.forEach((variant) => expanded.add(variant));
      }
    }
  }
  return [...expanded];
}

function sentenceCaseVendor(vendor) {
  return vendorLabels[vendor] || vendor;
}

function setVendor(vendor) {
  state.vendor = vendor;
  renderSuggestions();
  addBotMessage(
    `You’re set to ${sentenceCaseVendor(vendor)}. Ask any EPL question and I’ll use the shared EPL guides plus the ${sentenceCaseVendor(vendor)}-specific material when it applies.`
  );
}

function setRole(role) {
  state.role = role;
  renderSuggestions();
  addBotMessage(`Role set to ${roleLabels[role]}. I’ll prioritize ${role.toLowerCase()} workflows and procedures.`);
}

function renderSuggestions() {
  const rolePrompts = state.role ? roleSuggestedQuestions[state.role] : [];
  const vendorPrompts = state.vendor ? suggestedQuestions[state.vendor] : [];
  const seededPrompts = [...suggestedQuestions.general, ...rolePrompts, ...vendorPrompts]
    .filter((prompt, index, all) => all.indexOf(prompt) === index);
  const trackedPrompts = topTrackedQuestions()
    .filter((prompt) => !seededPrompts.includes(prompt));
  const prompts = [...trackedPrompts, ...seededPrompts].slice(0, 10);

  suggestions.innerHTML = "";
  for (const prompt of prompts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      questionInput.value = prompt;
      chatForm.requestSubmit();
    });
    suggestions.appendChild(button);
  }
}

function readSuggestionUsage() {
  try {
    return JSON.parse(localStorage.getItem(suggestionUsageStorageKey) || "{}");
  } catch {
    return {};
  }
}

function writeSuggestionUsage(usage) {
  try {
    localStorage.setItem(suggestionUsageStorageKey, JSON.stringify(usage));
  } catch {}
}

function readAnswerFeedback() {
  try {
    const parsed = JSON.parse(localStorage.getItem(answerFeedbackStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAnswerFeedback(entries) {
  try {
    localStorage.setItem(answerFeedbackStorageKey, JSON.stringify(entries));
  } catch {}
}

function normalizeQuestionForFeedback(question) {
  return normalize(question).replace(/\s+/g, " ").trim();
}

function getQuestionFeedbackProfile(question) {
  const normalizedQuestion = normalizeQuestionForFeedback(question);
  const matching = readAnswerFeedback().filter(
    (entry) => normalizeQuestionForFeedback(entry.question || "") === normalizedQuestion
  );

  return matching.reduce(
    (profile, entry) => {
      if (entry.vote === "up") {
        profile.up += 1;
      }
      if (entry.vote === "down") {
        profile.down += 1;
      }
      return profile;
    },
    { up: 0, down: 0 }
  );
}

function shouldPreferImprovedAnswer(question) {
  const profile = getQuestionFeedbackProfile(question);
  return profile.down > profile.up;
}

function isTrulyAmbiguousQuestion(question) {
  const lowered = question.toLowerCase().trim();
  return (
    /^how do i set this up\??$/.test(lowered) ||
    /^how does this work\??$/.test(lowered) ||
    /^how do i do this\??$/.test(lowered)
  );
}

function buildAnswerFingerprint(question, answerText) {
  const raw = `${question}||${answerText.slice(0, 1200)}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `fb-${hash.toString(16)}`;
}

function saveAnswerFeedback({ fingerprint, question, vote, answerPreview }) {
  const entries = readAnswerFeedback().filter((entry) => entry.fingerprint !== fingerprint);
  entries.unshift({
    fingerprint,
    question,
    vote,
    answerPreview,
    createdAt: new Date().toISOString(),
  });
  writeAnswerFeedback(entries.slice(0, 250));
}

function attachCopyButton(messageEl, answerText) {
  if (!messageEl || messageEl.querySelector(".copy-button")) {
    return;
  }

  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.type = "button";
  copyButton.innerHTML = '<span>📋 Copy</span>';
  copyButton.setAttribute("aria-label", "Copy answer to clipboard");

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(answerText);
      copyButton.classList.add("copied");
      copyButton.innerHTML = '<span>✓ Copied!</span>';
      setTimeout(() => {
        copyButton.classList.remove("copied");
        copyButton.innerHTML = '<span>📋 Copy</span>';
      }, 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  });

  messageEl.appendChild(copyButton);
}

function generateFollowUpQuestions(question, answerText) {
  const lowered = question.toLowerCase();
  const followUps = [];

  if (/setup|configure|set up/i.test(lowered)) {
    followUps.push("What are best practices for this setup?");
    followUps.push("How do I test this configuration?");
  }
  if (/bluebeam/i.test(lowered)) {
    followUps.push("What if a user forgot their Bluebeam password?");
    followUps.push("How do I manage a review in Bluebeam?");
  }
  if (/digeplan/i.test(lowered)) {
    followUps.push("How do I set up DigEplan SSO?");
    followUps.push("How do coordinators manage DigEplan reviews?");
  }
  if (/review|reviewer/i.test(lowered)) {
    followUps.push("How do I reassign a review?");
    followUps.push("How do reviewers add corrections and recommendations?");
  }
  if (/coordinator/i.test(lowered)) {
    followUps.push("How do I work a Review New Files task?");
    followUps.push("How do I set up Review Coordinator?");
  }
  if (/fee/i.test(lowered)) {
    followUps.push("How do I set up contact types?");
    followUps.push("How do I manage workflow setup?");
  }

  if (!followUps.length) {
    followUps.push("How do I set up fees in EPL?");
    followUps.push("How do I manage a review?");
  }

  return followUps.slice(0, 3);
}

function attachFollowUpQuestions(messageEl, question, answerText) {
  if (!messageEl || messageEl.querySelector(".follow-up-questions")) {
    return;
  }

  const followUps = generateFollowUpQuestions(question, answerText);
  if (!followUps.length) {
    return;
  }

  const container = document.createElement("div");
  container.className = "follow-up-questions";
  container.innerHTML = `
    <div class="follow-up-label">Related Questions</div>
    <ul class="follow-up-list">
      ${followUps.map(q => `<li class="follow-up-item" data-question="${q.replace(/"/g, '&quot;')}">${q}</li>`).join('')}
    </ul>
  `;

  const items = container.querySelectorAll(".follow-up-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      const followUpQuestion = item.getAttribute("data-question");
      if (followUpQuestion) {
        questionInput.value = followUpQuestion;
        questionInput.focus();
        chatForm.dispatchEvent(new Event("submit"));
      }
    });
  });

  messageEl.appendChild(container);
}

function attachAnswerFeedback(messageEl, question, answerText) {
  if (!messageEl || messageEl.querySelector(".feedback-controls")) {
    return;
  }

  const fingerprint = buildAnswerFingerprint(question, answerText);
  const savedVote = readAnswerFeedback().find((entry) => entry.fingerprint === fingerprint)?.vote || "";
  const controls = document.createElement("div");
  controls.className = "feedback-controls";
  controls.innerHTML = `
    <span class="feedback-label">Was this answer helpful?</span>
    <div class="feedback-buttons">
      <button type="button" class="feedback-button${savedVote === "up" ? " selected" : ""}" data-vote="up" aria-label="Thumbs up answer">👍</button>
      <button type="button" class="feedback-button${savedVote === "down" ? " selected" : ""}" data-vote="down" aria-label="Thumbs down answer">👎</button>
    </div>
    <span class="feedback-status">${savedVote ? "Saved" : ""}</span>
  `;

  const status = controls.querySelector(".feedback-status");
  const buttons = [...controls.querySelectorAll(".feedback-button")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const vote = button.getAttribute("data-vote");
      if (!vote) {
        return;
      }

      saveAnswerFeedback({
        fingerprint,
        question,
        vote,
        answerPreview: answerText.slice(0, 500),
      });

      buttons.forEach((candidate) => {
        candidate.classList.toggle("selected", candidate === button);
      });

      if (status) {
        status.textContent = vote === "up" ? "Saved as helpful" : "Saved for improvement";
      }
    });
  });

  messageEl.appendChild(controls);
}

function trackQuestionUsage(question) {
  const trimmed = question.trim();
  if (!trimmed) {
    return;
  }
  const usage = readSuggestionUsage();
  usage[trimmed] = (usage[trimmed] || 0) + 1;
  writeSuggestionUsage(usage);
}

function topTrackedQuestions(limit = 5) {
  const usage = readSuggestionUsage();
  return Object.entries(usage)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([question]) => question);
}

function addMessage(role, html, options = {}) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${role}`;
  wrapper.innerHTML = html;

  if (options.after && options.after.parentNode === chatLog) {
    options.after.insertAdjacentElement("afterend", wrapper);
  } else {
    chatLog.prepend(wrapper);
  }

  chatLog.scrollTop = 0;
  return wrapper;
}

function addBotMessage(text, sources = [], question = "") {
  let insertedMessage;
  const pendingQuestion = question || state.pendingUserMessage?.innerText?.trim() || "";
  if (text.trim().startsWith("<")) {
    insertedMessage = addMessage("bot", text, { after: state.pendingUserMessage });
  } else {
    let html = text
      .split("\n\n")
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
      .join("");

    if (sources.length) {
      const sourceText = sources
        .map((source) => `${source.guide_title}, p. ${source.page}`)
        .join(" • ");
      html += `<p class="sources"><strong>Sources:</strong> ${sourceText}</p>`;
    }
    insertedMessage = addMessage("bot", html, { after: state.pendingUserMessage });
  }
  state.pendingUserMessage = null;

  if (insertedMessage && !insertedMessage.querySelector(".copy-button")) {
    const textToCopy = insertedMessage.innerText.trim();
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.textContent = "Copy Checklist";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(textToCopy);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy Checklist";
        }, 1200);
      } catch {
        button.textContent = "Copy failed";
        setTimeout(() => {
          button.textContent = "Copy Checklist";
        }, 1200);
      }
    });
    actions.appendChild(button);
    insertedMessage.appendChild(actions);
  }

  insertedMessage?.querySelectorAll?.(".inline-question").forEach((button) => {
    button.addEventListener("click", () => {
      const followUp = button.getAttribute("data-question");
      if (!followUp) {
        return;
      }
      questionInput.value = followUp;
      chatForm.requestSubmit();
    });
  });

  attachAnswerFeedback(insertedMessage, pendingQuestion, insertedMessage?.innerText?.trim() || text);
  attachFollowUpQuestions(insertedMessage, pendingQuestion, insertedMessage?.innerText?.trim() || text);
}

function addUserMessage(text) {
  state.pendingUserMessage = addMessage("user", `<p>${text}</p>`);
}

function detectVendorSwitch(question) {
  const normalized = normalize(question);
  if (normalized.includes("bluebeam")) {
    return "bluebeam";
  }
  if (normalized.includes("digeplan")) {
    return "digeplan";
  }
  return "";
}

function detectRoleSwitch(question) {
  const normalized = normalize(question);
  if (/(admin|administrator|setup|configure|configuration)/.test(normalized)) {
    return "admin";
  }
  if (/(coordinator|task|review new files|failed submittal|approved submittal)/.test(normalized)) {
    return "coordinator";
  }
  if (/(reviewer|manage my reviews|reassign|resubmittal|recommendation|correction)/.test(normalized)) {
    return "reviewer";
  }
  return "";
}

function questionWantsDetailedProcedure(question) {
  return /sso|single sign on|setup|onboarding|configure|configuration|migration|migrate|switch|how do i set|how do we set/i.test(
    question
  );
}

function buildStepHtml(stepNumber, title, detail, source) {
  return `
    <li>
      <strong>${stepNumber}. ${title}</strong><br>
      <span class="step-detail">${detail}</span>
    </li>
  `;
}

function buildSimpleStepHtml(stepNumber, detail) {
  return `
    <li>
      <span class="step-detail">${detail}</span>
    </li>
  `;
}

function buildBulletList(items) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPlaybookSection(title, body) {
  return `
    <section class="answer-section">
      <h3>${title}</h3>
      ${body}
    </section>
  `;
}

function buildInlineSteps(items) {
  return `<ul class="inline-steps">${items
    .map((item) => item.replace(/^\d+\.\s*/, ""))
    .map((item) => `<li>${item}</li>`)
    .join("")}</ul>`;
}

function cleanInstructionText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\bFor more information, please refer to[^.]*\.?/gi, "")
    .replace(/\bThis image[^.]*\.?/gi, "")
    .replace(/\bEPL displays[^.]*\.?/gi, "")
    .trim();
}

function extractInstructionSentences(text, maxSentences = 8) {
  const cleaned = cleanInstructionText(text);
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, maxSentences);
}

function questionTopicLabel(question) {
  const lowered = question.toLowerCase();
  if (/\bfees?\b/.test(lowered)) return "fees";
  if (/\bpermits?\b/.test(lowered)) return "permits";
  if (/\bcontacts?\b/.test(lowered)) return "contacts";
  if (/\bworkflow\b/.test(lowered)) return "workflow";
  if (/\breviews?\b/.test(lowered)) return "reviews";
  if (/\binspections?\b/.test(lowered)) return "inspections";
  if (/\bcivic access\b/.test(lowered)) return "Civic Access";
  if (/\bbluebeam\b/.test(lowered)) return "Bluebeam";
  if (/\bdigeplan\b/.test(lowered)) return "DigEplan";
  if (/\bcoordinator\b/.test(lowered)) return "review coordinator work";
  return "your question";
}

function chunkInstructionItems(chunk, maxItems = 8) {
  const directSteps = extractProceduralSteps(chunk.text).slice(0, maxItems);
  if (directSteps.length) {
    return directSteps;
  }
  return extractInstructionSentences(chunk.text, maxItems);
}

function isGenericSectionLabel(section) {
  if (!section) {
    return true;
  }
  return /^section\s+\d+$/i.test(section) || /^page\s+\d+$/i.test(section);
}

function friendlyStepTitle(question, chunk) {
  const topic = questionTopicLabel(question);
  const guideTitle = (chunk.guide_title || "")
    .replace(/\b20\d{2}(?:\.\d+)?\b/g, "")
    .replace(/\b(user guide|setup guide|admin guide|guide)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!isGenericSectionLabel(chunk.section)) {
    return chunk.section;
  }

  if (/manage my reviews/i.test(guideTitle)) return "Manage My Reviews";
  if (/review coordinator/i.test(guideTitle)) return "Review Coordinator";
  if (/review management/i.test(guideTitle)) return "Review Management";
  if (/workflow/i.test(guideTitle)) return "Workflow Setup";
  if (/contact management/i.test(guideTitle)) return "Contact Management";
  if (/permit management/i.test(guideTitle)) return "Permit Management";
  if (/fee/i.test(guideTitle)) return "Fee Setup";
  if (/inspection/i.test(guideTitle)) return "Inspection Setup";
  if (/civic access/i.test(guideTitle)) return "Civic Access";

  switch (topic) {
    case "fees":
      return "Fee Setup";
    case "permits":
      return "Permit Setup";
    case "contacts":
      return "Contact Setup";
    case "workflow":
      return "Workflow Setup";
    case "reviews":
      return "Review Setup";
    case "inspections":
      return "Inspection Setup";
    case "Civic Access":
      return "Civic Access";
    default:
      return guideTitle || "EPL Setup";
  }
}

function bestPracticeItemsForTopic(topic) {
  if (topic === "fees") {
    return [
      "Reuse fee templates where possible instead of building one-off fee logic for every case type.",
      "Test calculated, percentage, CPI, proration, and condition-based fees in a non-production record before rollout.",
      "Keep the work class assignment clean, because that is what determines which fees users and applicants actually see.",
    ];
  }
  if (topic === "permits") {
    return [
      "Finalize the work class design early, because workflow, custom fields, fees, and contact behavior are attached there.",
      "Test one real permit scenario after setup so you can verify the end-to-end user experience instead of only checking configuration screens.",
      "Avoid changing key type or work class design after records are already in use unless the team has a migration plan.",
    ];
  }
  if (topic === "contacts") {
    return [
      "Standardize contact types and validation rules before attaching them to multiple work classes.",
      "Test contact validation with a sample case so you can confirm certification or license rules behave as expected.",
      "Keep naming and usage consistent across modules so staff know which contact type to use.",
    ];
  }
  if (topic === "workflow") {
    return [
      "Build and test workflow actions and steps in a lower environment before attaching the template broadly.",
      "Keep workflow templates as reusable as possible so similar case types do not drift apart unnecessarily.",
      "Validate workflow from the user-facing case, not just from the setup app, so you catch missing actions or bad routing.",
    ];
  }
  if (topic === "reviews") {
    return [
      "Test assignment behavior with the real department, team, and reviewer structure the client plans to use.",
      "Confirm both coordinator and reviewer experiences work before calling the setup complete.",
      "Use structured corrections and recommendations consistently so reviewers communicate outcomes clearly.",
    ];
  }
  if (topic === "inspections") {
    return [
      "Validate inspection setup with scheduling, status updates, and downstream workflow behavior together.",
      "Keep inspection types and case types clearly named so staff can pick the correct option quickly.",
      "Test both back-office and field or mobile scenarios if inspectors will work outside the office.",
    ];
  }
  if (topic === "Civic Access") {
    return [
      "Always test the applicant-facing experience after configuration, not just the admin settings.",
      "Confirm online visibility, payment behavior, and file rules with a sample public workflow before rollout.",
      "Keep online forms and options as simple as possible so customers do not run into avoidable confusion.",
    ];
  }
  return [
    "Test the configuration with one realistic sample record before rollout.",
    "Keep naming, templates, and setup choices consistent so staff can support the process more easily.",
    "Validate the setup from the user experience, not just from the admin screen.",
  ];
}

function buildGenericDetailedAnswer(question, chunks) {
  const topic = questionTopicLabel(question);
  const selected = chunks.slice(0, 5).map((chunk) => ({
    chunk,
    items: chunkInstructionItems(chunk, 8),
  })).map((entry) => ({
    ...entry,
    items: entry.items.filter((item) => {
      const cleaned = cleanInstructionText(item);
      if (!cleaned) {
        return false;
      }
      if (/^note\b/i.test(cleaned)) {
        return false;
      }
      if (cleaned.length < 25) {
        return false;
      }
      return true;
    }),
  })).filter((entry) => entry.items.length);

  if (!selected.length) {
    return `
      <p>Here are the detailed steps I found for ${topic} in EPL.</p>
      <p>I found relevant guide material, but not enough procedural text to build a reliable step-by-step answer from the current chunks.</p>
    `;
  }

  let stepNumber = 1;
  const sourceEntries = [];
  const steps = selected
    .map(({ chunk, items }) => {
      const sourceLabel = buildSourceWithLink(chunk.guide_id, chunk.section, chunk.page);
      sourceEntries.push(sourceLabel);
      return items.map((item) =>
        buildStepHtml(
          stepNumber++,
          friendlyStepTitle(question, chunk),
          item,
          sourceLabel
        )
      ).join("");
    })
    .join("");

  const prepItems = selected
    .map(({ chunk }) => {
      const text = cleanInstructionText(chunk.text);
      const sentences = extractInstructionSentences(text, 2);
      if (!sentences.length) {
        return "";
      }
      return `${sentences.join(' ')} Source: ${buildSourceWithLink(chunk.guide_id, chunk.section, chunk.page)}`;
    })
    .filter(Boolean)
    .slice(0, 5);

  return `
    <p>Here are the detailed step-by-step instructions for ${topic} in EPL. I’m using the most relevant guide sections and turning them into a procedure you can follow in the software.</p>
    ${buildPlaybookSection(
      "Before You Start",
      prepItems.length
        ? buildBulletList(prepItems)
        : "<p>No separate prerequisites were called out in the guide sections matched for this question.</p>"
    )}
    ${buildPlaybookSection("Step-By-Step", `<ol>${steps}</ol>`)}
    ${buildPlaybookSection(
      "Validation",
      buildBulletList([
        `Open the EPL app or setup area mentioned in the steps and confirm each field, tab, or action is available where expected.`,
        `Save the configuration or complete the action, then reopen the record to confirm the change persisted.`,
        `If this affects a case type, work class, workflow, or user-facing process, run one test record to confirm the outcome behaves as expected.`,
        `Check that all related records (like fees, contacts, workflows) are properly linked and functioning together.`,
        `Verify user permissions allow access to all necessary screens and actions.`,
      ])
    )}
    ${buildPlaybookSection(
      "Common Issues & Troubleshooting",
      buildBulletList([
        `<strong>Configuration not showing:</strong> Clear browser cache, rebuild cache in System Settings, or recycle app pools if changes don’t appear.`,
        `<strong>Missing fields or options:</strong> Verify user role permissions include access to the specific module and features.`,
        `<strong>Changes not saving:</strong> Check for required fields, validation rules, or workflow prerequisites that must be met first.`,
        `<strong>Integration issues:</strong> Confirm Windows Service tasks are enabled and running, check API credentials, verify network connectivity.`,
        `<strong>Workflow not triggering:</strong> Validate the workflow template is attached to the correct case type/work class and conditions are met.`,
      ])
    )}
    ${buildPlaybookSection(
      "Best Practices",
      buildBulletList(bestPracticeItemsForTopic(topic))
    )}
    ${buildDrillDownSection("Want More Detail?", suggestedDrillDownPrompts(question, chunks))}
    ${buildPlaybookSection(
      "Sources",
      buildBulletList([...new Set(sourceEntries)])
    )}
  `;
}

function guideMetaById(guideId) {
  const guides = state.kb?.guides || [];
  const normalized = (guideIdAliases[guideId] || guideId).toLowerCase();
  const matches = guides.filter((guide) => {
    const id = guide.id.toLowerCase();
    const family = (guide.family || "").toLowerCase();
    return id === normalized || id.startsWith(`${normalized}-`) || family === normalized;
  });

  if (!matches.length) {
    return null;
  }

  matches.sort((a, b) => {
    const aPreferred = a.is_preferred_source ? 1 : 0;
    const bPreferred = b.is_preferred_source ? 1 : 0;
    if (aPreferred !== bPreferred) {
      return bPreferred - aPreferred;
    }
    if ((a.source_priority || 0) !== (b.source_priority || 0)) {
      return (b.source_priority || 0) - (a.source_priority || 0);
    }
    const aVersion = (a.version_sort || []).join(".");
    const bVersion = (b.version_sort || []).join(".");
    return bVersion.localeCompare(aVersion, undefined, { numeric: true });
  });

  return matches[0];
}

function guideIdMatches(actualGuideId, expectedGuideId) {
  const actual = (actualGuideId || "").toLowerCase();
  const expected = ((guideIdAliases[expectedGuideId] || expectedGuideId) || "").toLowerCase();
  return actual === expected || actual.startsWith(`${expected}-`);
}

function guideHref(guideId) {
  const guide = guideMetaById(guideId);
  if (!guide) {
    return "#";
  }
  return `./Guides/${guide.filename}`;
}

function guideLinkLabel(guideId) {
  const guide = guideMetaById(guideId);
  return guide ? guide.title : guideId;
}

function buildSourceWithLink(guideId, section, page) {
  const href = guideHref(guideId);
  const label = guideLinkLabel(guideId);
  return `<a href="${href}" target="_blank" rel="noopener">${label}</a> -> ${section} (section ${page})`;
}

function buildGroupedSources(sourceRefs) {
  const grouped = new Map();

  sourceRefs.forEach(({ guideId, section, page }) => {
    const key = guideId;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    const entry = `${section} (section ${page})`;
    if (!grouped.get(key).includes(entry)) {
      grouped.get(key).push(entry);
    }
  });

  return buildBulletList(
    [...grouped.entries()].map(
      ([guideId, refs]) =>
        `<a href="${guideHref(guideId)}" target="_blank" rel="noopener">${guideLinkLabel(guideId)}</a> -> ${refs.join("; ")}`
    )
  );
}

function buildDigeplanSsoAnswer() {
  const source = buildSourceWithLink(
    "digeplan-client-onboarding",
    "DigEplan SSO Setup",
    5
  );
  const validationSource = buildSourceWithLink(
    "digeplan-client-onboarding",
    "Validating SSO",
    5
  );

  return `
    <p>If you are a consultant who has never set this up before, use this as your working sequence. The goal is to get the client's identity details registered through CorpDev, hand those credentials to DigEplan, and then verify the SSO button actually works in the tenant.</p>
    <p><strong>Before you start</strong><br>You will need access to the CorpDev request form, enough client identity information to know whether they use customer Okta or Tyler Gateway, and a safe way to receive credentials because the guide says CorpDev sends them through Kiteworks.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Open a CorpDev Support ticket for the DigEplan SSO request",
        "This is the official starting point for SSO setup. The onboarding guide says clients who want DigEplan SSO should begin by submitting a CorpDev Support ticket.",
        source
      )}
      ${buildStepHtml(
        2,
        "Fill in the core ticket values exactly as documented",
        "Use Product team(s) = EnerGov (All), Identity Client Request Type = New Client, and TCP Environment(s) = PROD - TylerPortico. These fields tell CorpDev what product and environment the identity client is for.",
        source
      )}
      ${buildStepHtml(
        3,
        "Choose the correct identity client type",
        "Set Identity Client Type = Authorization Code Flow (uses secret). If you are new to this, the important point is that DigEplan expects a client setup that uses a secret rather than a public client flow.",
        source
      )}
      ${buildStepHtml(
        4,
        "Choose the right identity provider",
        "Set Identity Provider to either Customer TID-W Tenant (Okta) or Gateway (Tyler Gateway), depending on how the client authenticates. If you are unsure, confirm that with the client before the ticket is submitted.",
        source
      )}
      ${buildStepHtml(
        5,
        "Name the identity client using the required convention",
        "Use <<CustomerNameWithoutSpaces>>-<<Selected TCPEnvironment>>-epl-digeplan-<<testtrainprod>>. The guide warns that the ticket will be rejected if the naming convention is wrong, so this is worth double-checking before submission.",
        source
      )}
      ${buildStepHtml(
        6,
        "Enter the DigEplan redirect URIs for both stage and production",
        "The guide provides specific sign-in and sign-out redirect URIs for stage and prod. Use those exact values in the request rather than guessing or reusing another application's callback URL.",
        source
      )}
      ${buildStepHtml(
        7,
        "Submit the ticket and wait for CorpDev to return credentials through Kiteworks",
        "Once the request is complete, CorpDev provides the credentials through Kiteworks. As the consultant, treat that handoff as the checkpoint that lets you move from identity setup to DigEplan-side configuration.",
        source
      )}
      ${buildStepHtml(
        8,
        "Send DigEplan Support the CorpDev credentials and the client's Okta URL",
        "Email support@digeplan.com and include the credentials from CorpDev plus the Okta URL used to log into the client's apps. This is the handoff DigEplan needs to complete their side of the SSO configuration.",
        source
      )}
      ${buildStepHtml(
        9,
        "Have DigEplan complete the SSO configuration in the tenant",
        "The guide explicitly says DigEplan completes the SSO configuration after they receive the identity information. As a consultant, this is the point where you should track status with DigEplan Support rather than trying to finish it entirely inside EPL.",
        source
      )}
      ${buildStepHtml(
        10,
        "Validate the login experience from an actual DigEplan link",
        "Open a DigEplan project link or the tenant link provided by DigEplan Support. The login screen should display the SSO option. Click Continue to verify that authentication succeeds.",
        validationSource
      )}
      ${buildStepHtml(
        11,
        "Confirm the user is marked as an SSO user after login",
        "After the user signs in successfully with SSO, check that the SSO User toggle is turned on in DigEplan settings. This is a practical confirmation that the SSO path is wired correctly for that user.",
        source
      )}
    </ol>
    <p><strong>Consultant tip</strong><br>If SSO is the client's long-term goal but not a same-day blocker, the onboarding guide says it can be requested after deployment. That gives you the option to separate core DigEplan integration setup from identity rollout if the project timeline is tight.</p>
  `;
}

function buildDigeplanSetupAnswer() {
  const source = `${buildSourceWithLink(
    "digeplan-client-onboarding",
    "DigEplan Configuration",
    8
  )}; ${buildSourceWithLink("digeplan-client-onboarding", "EPL Configuration", 9)}`;

  return `
    <p>This version is written for a consultant starting from zero. Think of the work in four phases: understand how EPL uses eReviews, get the DigEplan tenant and security pieces, connect DigEplan to EPL, then validate the process using the coordinator and reviewer apps.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Understand the EPL roles and where DigEplan fits",
        "Before configuring anything, make sure you understand the moving parts. The EPL setup guide says the eReviews process uses the Review Coordinator app to manage intake and case progression, and the Manage My Reviews app for reviewers to complete their work. That means your technical setup is only successful if both the integration and the user workflow work together.",
        `${buildSourceWithLink("review-management-setup", "Overview", 4)}; ${buildSourceWithLink("review-coordinator", "Overview", 3)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Overview", 3)}`
      )}
      ${buildStepHtml(
        2,
        "Request the DigEplan tenant and PAT tokens first",
        "Email support@digeplan.com to request tenant setup. Request a tenant for each EPL environment and ask DigEplan to send the PAT tokens through a secure one-time-use link. Do not open the PAT token link until you are ready to enter it in EPL, because the guide warns you may need a new token if it is not captured correctly.",
        buildSourceWithLink("digeplan-client-onboarding", "DigEplan Tenant Setup (EPL Implementation)", 4)
      )}
      ${buildStepHtml(
        3,
        "Find the EPL Tenant ID and Web API Proxy values",
        "In EPL, locate the Tenant ID in System Settings > Other > Search > Tenant. Then locate the EnerGov Web API Proxy in System Settings > eReviews > General. You will need both values during DigEplan connector setup.",
        `${buildSourceWithLink("digeplan-client-onboarding", "Tenant ID", 3)}; ${buildSourceWithLink("digeplan-client-onboarding", "EnerGov Web API Proxy", 7)}`
      )}
      ${buildStepHtml(
        4,
        "Handle the on-premise proxy requirement if the client is not cloud-hosted",
        "If the client is on-premise, the onboarding guide says you must submit a CRM case to the EPL TSM queue so proxy can be enabled for the environment. Cloud and hosted SaaS clients skip this step. As a consultant, do this early because connector testing depends on the environment URL path being ready.",
        buildSourceWithLink("digeplan-client-onboarding", "EPL Deployment - Required for On-premise Clients Only", 6)
      )}
      ${buildStepHtml(
        5,
        "Configure DigEplan Base Config as an admin",
        "Log into DigEplan as an admin, go to Admin, then Connector Config > Base Config. Populate Base URL with the EnerGov Web API Proxy and confirm Permit System Account Username is digeplan.integrations.",
        buildSourceWithLink("digeplan-client-onboarding", "DigEplan Configuration", 8)
      )}
      ${buildStepHtml(
        6,
        "Populate the DigEplan connector values from EPL",
        "In DigEplan Connector Config, copy in Tenant ID, Authentication Endpoint, Client ID, Client Secret, and Scope from EPL. The onboarding page maps each EPL field to the matching DigEplan field, so follow that table exactly.",
        source
      )}
      ${buildStepHtml(
        7,
        "Run Test Connector before moving on",
        "Use DigEplan's Test Connector and click Run. If it fails, stop and correct the connector values before doing deeper EPL setup, because the integration will not work reliably if the base connection is wrong.",
        buildSourceWithLink("digeplan-client-onboarding", "Test Connector", 8)
      )}
      ${buildStepHtml(
        8,
        "Confirm the webhook is present before you leave DigEplan administration",
        "Open Webhooks in DigEplan and confirm the EPL Download Process webhook exists. If it does not, create it using the Appendix A values, including the POST route and JSON body. This matters because EPL relies on that webhook during file close-out and synchronization.",
        `${buildSourceWithLink("digeplan-client-onboarding", "WebHooks", 8)}; ${buildSourceWithLink("digeplan-client-onboarding", "Appendix A - Webhooks", 13)}`
      )}
      ${buildStepHtml(
        9,
        "Prepare EPL for DigEplan by checking feature flags and security access",
        "In EPL 2025.1 and later, the DigEplan feature flag is already active. In older versions, the onboarding page says to verify the EnableDigEplanFeatureFlag setting in SQL and update it if needed. Also enable Allow eReviews Integration Type Administration in User Roles so administrators can manage the integration type setting.",
        buildSourceWithLink("digeplan-client-onboarding", "EPL Configuration", 9)
      )}
      ${buildStepHtml(
        10,
        "Populate the EPL DigEplan Integration settings",
        "Go to System Settings > eReviews > General and set Integration Type to DigEplan. Then go to System Settings > eReviews > DigEplan Integration and enter the PAT token, API Base URL, API Route /public/v1/, API Base Environment usw.digeplan.app, and iFrame Route dpc/login. If you are migrating a live client, the migration page also notes that some teams temporarily save the DigEplan values and then switch the integration back to Bluebeam until the go-live date.",
        `${buildSourceWithLink("digeplan-client-onboarding", "EPL Configuration", 9)}; ${buildSourceWithLink("digeplan-live-client-migration", "EPL Settings", 3)}`
      )}
      ${buildStepHtml(
        11,
        "Enable the required Windows Service tasks",
        "Turn on Electronic Review Integration Process, File Transfer, Case Update, FileVersion Uploaded, and Worker Process. The onboarding page gives the expected cadence, mostly every 1 minute, with the worker process once daily at 12:05am. The migration guide adds one important detail: if the client is still on Bluebeam during transition, keep the Worker Process enabled so Bluebeam token refresh continues.",
        `${buildSourceWithLink("digeplan-client-onboarding", "EPL Configuration", 9)}; ${buildSourceWithLink("digeplan-live-client-migration", "EPL Settings", 3)}`
      )}
      ${buildStepHtml(
        12,
        "Refresh the environment if configuration changes are not showing up",
        "If the new configuration does not appear to take effect, the onboarding guide says to rebuild cache, recycle the EnerGovWebApi, Review Coordinator, and Permit/Plan/BL/MMR app pools, and restart the Windows Service. Do not assume the setup is wrong until you have done these refresh steps.",
        buildSourceWithLink("digeplan-client-onboarding", "EPL Configuration", 9)
      )}
      ${buildStepHtml(
        13,
        "Finish the DigEplan administrative setup that users will depend on",
        "After the connector works, complete the DigEplan-side operating setup: create departments, add users, add stamps, review the file size limit, and confirm allowed upload file extensions. These are not optional quality-of-life items. They affect how the jurisdiction actually performs reviews in production.",
        buildSourceWithLink("digeplan-client-onboarding", "Additional DigEplan Configuration", 10)
      )}
      ${buildStepHtml(
        14,
        "Validate the coordinator workflow, not just the connector",
        "Open the Review Coordinator app and make sure the team can see the expected tasks and cases. The Review Coordinator guide explains that coordinators use Review new files, Review failed submittal, and Review approved submittal tasks to move the eReviews process forward. A successful technical setup still fails the client if the coordinator cannot pick up and work those tasks.",
        `${buildSourceWithLink("review-coordinator", "Overview", 3)}; ${buildSourceWithLink("review-coordinator", "Task Overview", 10)}; ${buildSourceWithLink("review-coordinator", "Work a Task", 27)}; ${buildSourceWithLink("review-management-setup", "Task Configuration", 36)}`
      )}
      ${buildStepHtml(
        15,
        "Validate the reviewer workflow inside Manage My Reviews",
        "Open a DigEplan-based item review in Manage My Reviews and confirm the reviewer can launch the DigEplan project, mark up files, request resubmittal when needed, and add corrections and recommendations. The DigEplan user guide is the best final proof that the setup works from the end-user side.",
        `${buildSourceWithLink("manage-my-reviews-digeplan", "Perform Review", 28)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Request for Resubmittal", 31)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Corrections", 34)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Recommendations", 37)}`
      )}
    </ol>
    <p><strong>What to test before you call setup complete</strong><br>At minimum, verify that a coordinator can receive a new-files task, a reviewer can open the DigEplan project from EPL, markups can be created, a resubmittal can be requested, and corrections or recommendations can be stored back in EPL. That gives you both technical validation and user-workflow validation.</p>
  `;
}

function buildBluebeamSetupAnswer() {
  return `
    <p>This setup path is for a consultant or administrator starting from zero. Think of Bluebeam eReviews as four layers: EPL review setup, Bluebeam licensing and roles, the integration settings between EPL and Bluebeam Studio, and then coordinator and reviewer testing.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Confirm the jurisdiction is actually using the eReviews process, not only standard reviews",
        "In EPL, standard reviews and eReviews are different. Bluebeam is used only for the eReviews path. That means the jurisdiction must be using Review Coordinator, Manage My Reviews, eReview files, and the online submittal process that supports electronic review cycles.",
        `${buildSourceWithLink("review-management-setup", "Overview", 2)}; ${buildSourceWithLink("workflow-functionality", "Section 129", 129)}`
      )}
      ${buildStepHtml(
        2,
        "Set up the basic EPL review structure before touching Bluebeam",
        buildInlineSteps([
          "1. In <strong>Review Management Setup</strong>, create the departments that will own the reviews and confirm the right users and user roles exist for coordinators, reviewers, and team leads.",
          "2. Configure <strong>Item Review Statuses</strong> first, then create the <strong>Item Review Types</strong> that reviewers will actually receive.",
          "3. Configure <strong>Submittal Types</strong> and the review sets or routing rules that determine when those item reviews are created.",
          "4. Configure <strong>File Statuses</strong>, file categories, and file handling rules so EPL can distinguish files that stay in attachments from files that move into the eReview cycle.",
          "5. Open the eReview <strong>Task Configuration</strong> settings and make sure Review New Files, Review Failed Submittal, and Review Approved Submittal are enabled for the submittal types that should use electronic review.",
          "6. Do not move to Bluebeam setup until you can explain who receives the review, who receives the coordinator task, what file statuses will be used, and what happens when a submittal fails or is approved.",
        ]),
        `${buildSourceWithLink("review-management-setup", "Item Reviews", 13)}; ${buildSourceWithLink("review-management-setup", "Task Configuration", 33)}; ${buildSourceWithLink("review-management-setup", "Status Definitions", 45)}`
      )}
      ${buildStepHtml(
        3,
        "Give the right EPL users access to the correct apps",
        "In User Roles, grant access to Review Coordinator, Manage My Reviews, My Reviews Summary, and any review dashboards the jurisdiction needs. Review coordinators need Review Coordinator access, and reviewers need Manage My Reviews access.",
        buildSourceWithLink("review-management-setup", "Page 7", 7)
      )}
      ${buildStepHtml(
        4,
        "Understand the two Bluebeam software pieces the jurisdiction needs",
        "Bluebeam Studio Prime is the administrative subscription that supports the integration and Studio Session management. Bluebeam Revu Core or Complete is the desktop software reviewers use to open the session and create markups. In simple terms: Studio Prime runs the shared session environment; Revu is the tool people use to mark up files.",
        `${buildSourceWithLink("terminologyand", "Section 718", 718)}; ${buildSourceWithLink("terminologyand", "Section 719", 719)}; ${buildSourceWithLink("terminologyand", "Section 720", 720)}; ${buildSourceWithLink("terminologyand", "Section 721", 721)}`
      )}
      ${buildStepHtml(
        5,
        "Assign the correct Bluebeam user roles for coordinators and reviewers",
        "Review coordinators should be treated as Bluebeam Studio Prime Members because they create and manage Studio Sessions from EPL. Reviewers participate as Collaborators when they join sessions to mark up files. If a person does both jobs, treat them as a Member.",
        `${buildSourceWithLink("review-management-setup", "Bluebeam Users", 30)}; ${buildSourceWithLink("review-management-setup", "Bluebeam Contact Information", 31)}; ${buildSourceWithLink("bluebeam-licenses", "Section 21", 21)}; ${buildSourceWithLink("bluebeam-licenses", "Section 22", 22)}`
      )}
      ${buildStepHtml(
        6,
        "Set up the Bluebeam Studio integration inside EPL System Settings",
        "Open System Settings, go to eReviews, then open Bluebeam Sessions Integration. Copy the Integration ID from EPL, because that value is used during the Bluebeam-side integration setup. Then finish the EPL-side Bluebeam settings, including the error email recipients and any options for printing, saving, or markup alerts while users are in Studio Sessions.",
        `${buildSourceWithLink("review-management-setup", "Bluebeam Studio Prime", 27)}; ${buildSourceWithLink("review-management-setup", "To complete the configuration in EPL:", 29)}`
      )}
      ${buildStepHtml(
        7,
        "Make sure the jurisdiction environment is authorized on the Bluebeam integration side",
        "There is a Bluebeam Developer Network authorization step that allows the jurisdiction's Review Coordinator URL or environment URL to authenticate with Bluebeam. For Tyler-hosted implementation teams, this is part of the Bluebeam integration deployment process. If this step is missed, users may fail authentication even if the EPL settings look correct.",
        buildSourceWithLink("bluebeam-developer-network-integration", "Managing Bluebeam Integration App", 1)
      )}
      ${buildStepHtml(
        8,
        "Invite Bluebeam Members and confirm coordinators can sign in cleanly",
        "In Bluebeam Studio Prime, invite the coordinator users as Members. Have them accept the invitation and sign in. The Review Coordinator guide also notes that marking Keep me logged in helps avoid repeated Bluebeam sign-in prompts when EPL creates sessions.",
        `${buildSourceWithLink("review-management-setup", "Bluebeam Users", 30)}; ${buildSourceWithLink("review-coordinator", "Section 42", 42)}`
      )}
      ${buildStepHtml(
        9,
        "Enable the required Windows Service tasks for the eReviews process",
        "Open Windows Service Tasks Settings and enable the electronic review tasks EPL needs, including FileVersion Uploaded, Integration Error Email, Integration Process, Clear Snoozed System Task, and Process eReview File Submissions by Category. These services support file processing, session closure, and customer-facing file availability.",
        buildSourceWithLink("review-management-setup", "Windows Service Task Settings", 32)
      )}
      ${buildStepHtml(
        10,
        "Configure the three Review Coordinator task types the Bluebeam process depends on",
        "Open System Tasks and configure Review new files, Review failed submittal, and Review approved submittal. These tasks are what allow coordinators to receive files, start the Bluebeam session, release failed files for resubmittal, and complete approved cycles back to the applicant.",
        `${buildSourceWithLink("review-management-setup", "Task Configuration", 33)}; ${buildSourceWithLink("review-management-setup", "Page 37", 37)}; ${buildSourceWithLink("review-management-setup", "Page 40", 40)}`
      )}
      ${buildStepHtml(
        11,
        "Teach the coordinator exactly how files move into a Bluebeam Studio Session",
        "When the Review new files task appears, the coordinator reviews the uploaded files, marks the files that should be reviewed with an In Review status, receives the submittal, and then uses Start/Sync Bluebeam Studio Session. EPL sends any files marked In Review into the session and automatically invites the assigned reviewers when the task is completed.",
        `${buildSourceWithLink("review-coordinator", "Section 57", 57)}; ${buildSourceWithLink("review-coordinator", "Section 105", 105)}; ${buildSourceWithLink("review-coordinator", "Section 255", 255)}; ${buildSourceWithLink("review-coordinator", "Section 272", 272)}`
      )}
      ${buildStepHtml(
        12,
        "Teach reviewers how to open the Bluebeam session from EPL",
        "In Manage My Reviews, reviewers begin on the eReview Files tab, click the Studio Session link, confirm the Open Bluebeam Revu prompt, and then perform their markups in Bluebeam Revu. This matters because reviewers should not be opening or marking up separate local files outside the shared session.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Perform Review", 23)}; ${buildSourceWithLink("manage-my-reviews", "Section 148", 148)}`
      )}
      ${buildStepHtml(
        13,
        "Validate failed and approved submittal behavior before go-live",
        "Run both a failed-review test and an approved-review test. For failed reviews, confirm the session closes, the correct files are marked Required for Resubmittal, and the applicant can resubmit through Civic Access. For approved reviews, confirm approved or allowed files move out of eReview Files into Attachments as expected.",
        `${buildSourceWithLink("review-coordinator", "Section 33", 33)}; ${buildSourceWithLink("review-coordinator", "Section 34", 34)}; ${buildSourceWithLink("review-management-setup", "Status Definitions", 45)}`
      )}
      ${buildStepHtml(
        14,
        "Check the key Bluebeam-specific limitations before rollout",
        "With Bluebeam eReviews, only one active submittal can be in workflow at a time. Also, if multiple people share the same workstation, the Bluebeam and EPL user relationship can get crossed and may need to be cleared from the Bluebeam Studio Users app. These are important support details because they often look like setup failures when they are really process or environment issues.",
        `${buildSourceWithLink("review-management-setup", "Other Considerations for eReviews", 52)}; ${buildSourceWithLink("review-management-setup", "Workflow", 54)}`
      )}
    </ol>
  `;
}

function buildContactSetupAnswer() {
  return `
    <p>Setting up <strong>contact types</strong> in EPL is usually a two-step process: first you create the contact types in Contact Management Setup, then you attach those contact types to the correct permit type and work class in Permit Management Setup.</p>
    <p>For permits, contact types are one of the main setup components that should be considered together with workflow, custom fields, and fees.</p>
    ${buildPlaybookSection(
      "Before You Start",
      `
        ${buildBulletList([
          "Land Management Contact Types should already exist before you try to enforce them on a permit type/work class.",
          "The Permit Type and Work Class should already exist, because contact behavior is configured at the work class level.",
          "You need security access to both Contact Management Setup and Permit Management Setup.",
          "If you plan to validate certifications or licenses, the related certification types, classifications, and groups should also be configured first.",
        ])}
      `
    )}
    ${buildPlaybookSection(
      "Step-By-Step",
      `
        <ol>
          ${buildStepHtml(
            1,
            "Open the Land Management Contact Type Setup app",
            "For permit, plan, application, and impact-case setup, use the <strong>Land Management Contact Type Setup</strong> app. This is the app that creates the contact types later used on permit work classes.",
            buildSourceWithLink("contact-management", "Section 122", 122)
          )}
          ${buildStepHtml(
            2,
            "Create or edit the contact type record",
            "Click <strong>Add New</strong>, or use <strong>Add Land Management Contact Type</strong> if this is the first one in the module. Enter the displayed name and description the jurisdiction wants staff and applicants to see.",
            `${buildSourceWithLink("contact-management", "Section 125", 125)}; ${buildSourceWithLink("contact-management", "Section 127", 127)}`
          )}
          ${buildStepHtml(
            3,
            "Select the correct System Type",
            "Choose the <strong>System Type</strong> that best matches the business meaning of the contact, such as applicant, contractor, owner, or engineer. This is important because EPL uses the System Type to understand how the contact functions in the process.",
            `${buildSourceWithLink("contact-management", "Section 66", 66)}; ${buildSourceWithLink("contact-management", "Section 141", 141)}`
          )}
          ${buildStepHtml(
            4,
            "Turn on validation only if this contact should be checked",
            "If the contact type must be validated on permits, enable the correct option: <strong>Validate Certificate</strong>, <strong>Validate Professional License</strong>, or <strong>Validate Business License</strong>. Only enable these when the jurisdiction really intends to enforce them.",
            `${buildSourceWithLink("contact-management", "Section 130", 130)}; ${buildSourceWithLink("contact-management", "Section 131", 131)}; ${buildSourceWithLink("contact-management", "Section 132", 132)}`
          )}
          ${buildStepHtml(
            5,
            "Save the contact type and confirm any supporting certification setup exists",
            "If you enabled certificate or license validation, make sure the certification types, classifications, and groups are also configured in Contact Management. The contact type alone does not complete the validation setup.",
            `${buildSourceWithLink("contact-management", "Section 134", 134)}; ${buildSourceWithLink("contact-management", "Section 208", 208)}; ${buildSourceWithLink("contact-management", "Section 212", 212)}`
          )}
          ${buildStepHtml(
            6,
            "Open Permit Type Setup and select the correct Permit Type",
            "Open <strong>Permit Type Setup</strong>, choose the permit type, and then move to the correct work class. Contact types are not controlled only at the permit-type level; they are configured at the <strong>work class</strong> level.",
            `${buildSourceWithLink("permit-management", "Section 108", 108)}; ${buildSourceWithLink("permit-management", "Section 109", 109)}; ${buildSourceWithLink("permit-management", "Section 240", 240)}`
          )}
          ${buildStepHtml(
            7,
            "Open the Contact Types tab and add the allowed contact types",
            "On the permit work class, open the <strong>Contact Types</strong> tab, click <strong>Add Contact Types</strong>, search for the Land Management Contact Types you want, select them, and add them to the work class.",
            `${buildSourceWithLink("permit-management", "Section 400", 400)}; ${buildSourceWithLink("permit-management", "Section 402", 402)}; ${buildSourceWithLink("permit-management", "Section 405", 405)}`
          )}
          ${buildStepHtml(
            8,
            "Mark required contact behavior if the jurisdiction wants enforcement",
            "For each configured contact type, decide whether it should be required. If required contact types are configured, users or applicants must satisfy those requirements before saving the record.",
            `${buildSourceWithLink("contact-management", "Section 71", 71)}; ${buildSourceWithLink("permit-management", "Section 425", 425)}`
          )}
          ${buildStepHtml(
            9,
            "Use Set Numbers if the jurisdiction wants either-or requirements",
            "If two or more contact types should satisfy the same requirement group, assign them the same <strong>Set Number</strong>. That lets EPL treat them as an either-or requirement instead of making every type mandatory.",
            buildSourceWithLink("permit-management", "Section 417", 417)
          )}
          ${buildStepHtml(
            10,
            "If validation is enabled, attach the required certification or license types to the work class too",
            "Turning on validation in the contact type is only part of the setup. If permits should validate certifications, professional licenses, or business licenses, add those required types on the permit type/work class so EPL knows what to validate against when the contact is added or when the permit is issued.",
            `${buildSourceWithLink("permit-management", "Section 286", 286)}; ${buildSourceWithLink("permit-management", "Section 315", 315)}; ${buildSourceWithLink("permit-management", "Section 316", 316)}; ${buildSourceWithLink("permit-management", "Section 317", 317)}`
          )}
          ${buildStepHtml(
            11,
            "Save the permit work class and test the contact behavior on a real permit",
            "Create a test permit using the configured type and work class. Add the expected contact types and verify that EPL either accepts them or blocks them correctly based on the required contact and validation rules. If online apply is enabled, test the same behavior from the customer side as well.",
            `${buildSourceWithLink("permit-management", "Section 262", 262)}; ${buildSourceWithLink("permit-management", "Section 264", 264)}; ${buildSourceWithLink("permit-management", "Section 317", 317)}`
          )}
        </ol>
      `
    )}
    ${buildPlaybookSection(
      "How EPL Behaves",
      `
        ${buildBulletList([
          "If no contact types are configured on the work class, users can choose from all Land Management Contact Types.",
          "If only required contact types are configured, the full list may still be visible, but the required ones must be present before saving.",
          "If specific contact types are configured as the allowed list, users are limited to those configured choices for that work class.",
          "If validation is enabled, EPL checks the contact's certification or license when the contact is added and again when the permit is issued.",
        ])}
      `
    )}
    ${buildPlaybookSection(
      "Validation",
      `
        <ol>
          <li>Create a test permit using the configured Permit Type and Work Class.</li>
          <li>Go to the Contacts step or Contacts tab.</li>
          <li>Verify only the expected contact types are available.</li>
          <li>Try saving without the required contact types to confirm EPL blocks the save correctly.</li>
          <li>If validation is enabled, test with both a valid and invalid contact to confirm the rule behaves correctly.</li>
          <li>If the work class is online, repeat the same test in Civic Access.</li>
        </ol>
      `
    )}
    ${buildPlaybookSection(
      "Best Practices",
      buildBulletList([
        "Use consistent naming so staff can tell the difference between the jurisdiction label and the underlying EPL system type.",
        "Configure contact behavior at the work class level only where needed so users are not given unnecessary choices.",
        "Use Set Numbers instead of duplicating work classes when the business rule is really an either-or contact requirement.",
        "Only enable validation on contact types that truly require license or certification checks, because validation adds setup and testing dependencies.",
        "Test both the back-office experience and the permit or online application experience if customers will be adding contacts themselves.",
      ])
    )}
    ${buildDrillDownSection("Want More Detail?", [
      "set up land management contact types",
      "configure certification or license validation",
      "attach contact types to a permit work class",
      "test contact validation on a case",
    ])}
    ${buildPlaybookSection(
      "Sources",
      buildGroupedSources([
        { guideId: "contact-management", section: "Section 43", page: 43 },
        { guideId: "contact-management", section: "Section 122", page: 122 },
        { guideId: "contact-management", section: "Section 127", page: 127 },
        { guideId: "contact-management", section: "Section 66", page: 66 },
        { guideId: "contact-management", section: "Section 130", page: 130 },
        { guideId: "contact-management", section: "Section 134", page: 134 },
        { guideId: "permit-management", section: "Section 109", page: 109 },
        { guideId: "permit-management", section: "Section 400", page: 400 },
        { guideId: "permit-management", section: "Section 417", page: 417 },
        { guideId: "permit-management", section: "Section 315", page: 315 },
      ])
    )}
  `;
}

function buildDigeplanReviewerAnswer() {
  return `
    <p>This is the step-by-step reviewer workflow using DigEplan from the EPL user guides. Use it when training a reviewer who needs to perform the review from start to finish.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Open Manage My Reviews and find the assigned item review",
        "From the EPL home page, search for Manage My Reviews and open the app. Review cards show incomplete reviews and let the reviewer launch the full review, reassign it, or complete a quick update.",
        `${buildSourceWithLink("manage-my-reviews-digeplan", "Navigation", 4)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Manage My Reviews", 5)}`
      )}
      ${buildStepHtml(
        2,
        "Launch the full review instead of staying only on the list card",
        "Use launch to open the full item review when the reviewer needs to inspect files, submittal details, corrections, recommendations, or other review tabs.",
        buildSourceWithLink("manage-my-reviews-digeplan", "Open Review", 15)
      )}
      ${buildStepHtml(
        3,
        "Choose the right starting tab based on review type",
        "For a standard review, begin with Attachments. For an electronic review, begin with eReview Files. This distinction matters because DigEplan work happens through the eReview Files path, not through the standard attachment-only path.",
        buildSourceWithLink("manage-my-reviews-digeplan", "Perform Review", 28)
      )}
      ${buildStepHtml(
        4,
        "Open the DigEplan project from the review header or eReview Files area",
        "Click Open DigEplan Project when the link is available. EPL opens the DigEplan login or welcome flow, where the reviewer enters email and password and continues into the project.",
        buildSourceWithLink("manage-my-reviews-digeplan", "Perform Review", 28)
      )}
      ${buildStepHtml(
        5,
        "Review and mark up the files inside DigEplan",
        "Inside DigEplan, open the document, use the markup tools, and move between files as needed. The guide notes that DigEplan automatically saves markups, so reviewers do not need to manually click save after each comment.",
        buildSourceWithLink("manage-my-reviews-digeplan", "Perform Review", 28)
      )}
      ${buildStepHtml(
        6,
        "Return to EPL and flag files for resubmittal if changes are required",
        "Back on the eReview Files tab, identify the file, edit it, select Request for Resubmittal as the recommended status, add resubmittal instructions, and toggle Needs Customer Attention when the applicant should be alerted in Civic Access.",
        buildSourceWithLink("manage-my-reviews-digeplan", "Request for Resubmittal", 31)
      )}
      ${buildStepHtml(
        7,
        "Add corrections when the review must not be approved until issues are resolved",
        "Use the Corrections tab to add formal corrections. The guide says if unresolved corrections exist, the reviewer cannot approve the review, so corrections are the right mechanism when follow-up work is mandatory.",
        buildSourceWithLink("manage-my-reviews-digeplan", "Corrections", 34)
      )}
      ${buildStepHtml(
        8,
        "Add recommendations for explanatory notes that do not block approval",
        "Use the Recommendations tab for extra narrative guidance or long-form notes to the applicant. Recommendations are useful when the reviewer wants to explain context without preventing approval.",
        buildSourceWithLink("manage-my-reviews-digeplan", "Recommendations", 37)
      )}
      ${buildStepHtml(
        9,
        "Review the overall submittal and other review context before completing",
        "Use the review tabs to inspect the submittal, review summary, parent summary, internal notes, and related item reviews. This helps the reviewer understand whether their discipline-specific work is aligned with the overall submittal status.",
        `${buildSourceWithLink("manage-my-reviews-digeplan", "Tab Overview", 16)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Review Summary", 40)}`
      )}
      ${buildStepHtml(
        10,
        "Complete or update the review in EPL",
        "Once markup and review comments are done, the reviewer returns to EPL to complete the item review or update its status. If corrections remain unresolved, approval will not be available.",
        `${buildSourceWithLink("manage-my-reviews-digeplan", "Complete Review (Quick), Update Status", 14)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Corrections", 34)}`
      )}
    </ol>
  `;
}

function buildDigeplanCoordinatorAnswer() {
  return `
    <p>This is the coordinator-side workflow for consultants or power users who need to understand how eReviews is administered after the technical setup is done.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Open the Review Coordinator app and understand its purpose",
        "The Review Coordinator app manages intake and progression of electronic plan and permit reviews. In most jurisdictions this role may be handled by intake staff, planners, or selected reviewers rather than a dedicated review coordinator title.",
        buildSourceWithLink("review-coordinator", "Overview", 3)
      )}
      ${buildStepHtml(
        2,
        "Know the three task types that move the process forward",
        "The guide identifies Review new files, Review failed submittal, and Review approved submittal as the three core tasks. When training a client, explain that these tasks are how the coordinator keeps the eReviews process moving between applicant submission and final routing.",
        buildSourceWithLink("review-coordinator", "Overview", 3)
      )}
      ${buildStepHtml(
        3,
        "Use tiles and inbox tasks to monitor the workload",
        "The CASES, IN REVIEW, UPCOMING DUE, OVERDUE, and MY REVIEWS tiles help the coordinator watch progress, while the inbox task list is where active work gets assigned and completed.",
        `${buildSourceWithLink("review-coordinator", "Review Coordinator", 5)}; ${buildSourceWithLink("review-coordinator", "Tiles", 6)}`
      )}
      ${buildStepHtml(
        4,
        "Claim or reassign tasks correctly when teams are involved",
        "If tasks are assigned to a team, a coordinator can assign the task to themselves or return it to the team depending on permissions. The team-related setup guide also explains how team leads can view and reassign coordinator work.",
        `${buildSourceWithLink("review-coordinator", "Task Overview", 10)}; ${buildSourceWithLink("review-management-setup", "Team Configuration", 12)}`
      )}
      ${buildStepHtml(
        5,
        "Open the task and inspect the eReview files first",
        "When working a task, launch it and review each uploaded file. The setup guide says the Review new files task exists so coordinators know when files are uploaded and can decide whether the submittal is ready to move forward.",
        `${buildSourceWithLink("review-coordinator", "Work a Task", 27)}; ${buildSourceWithLink("review-management-setup", "Task Configuration", 36)}`
      )}
      ${buildStepHtml(
        6,
        "Use DigEplan-linked file handling to start the actual review cycle",
        "The coordinator is responsible for the point where the files and review workflow meet. This includes checking whether files are acceptable, driving the process into review, and communicating back if files are missing or need correction.",
        `${buildSourceWithLink("review-coordinator", "Overview", 3)}; ${buildSourceWithLink("review-coordinator", "Work a Task", 27)}; ${buildSourceWithLink("review-management-setup", "Task Configuration", 36)}`
      )}
      ${buildStepHtml(
        7,
        "Coordinate reviewer follow-up using due-date and in-review visibility",
        "Use the UPCOMING DUE and OVERDUE views to monitor reviewer progress and follow up when needed. The coordinator guide describes those tiles as tools for keeping active submittals on track.",
        buildSourceWithLink("review-coordinator", "Tiles", 6)
      )}
      ${buildStepHtml(
        8,
        "Validate the handoff back to the applicant or next process stage",
        "A good coordinator test is not just opening tasks, but proving that failed submittals, approved submittals, and active cases move through the app the way the jurisdiction expects. This is where process testing should mirror the client's real business flow.",
        `${buildSourceWithLink("review-coordinator", "Overview", 3)}; ${buildSourceWithLink("review-coordinator", "Task Overview", 10)}`
      )}
    </ol>
  `;
}

function buildGeneralEplSetupAnswer() {
  return `
    <p>This is the step-by-step EPL administrative setup path for establishing the review process in the software. It is aimed at an administrator or consultant configuring EPL, not a reviewer completing one assigned review.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Decide whether the jurisdiction is using standard reviews or eReviews",
        "EPL supports two review models. Standard reviews are handled through the case workflow and Manage My Reviews. eReviews adds Review Coordinator, online customer interaction through Civic Access, and an electronic markup integration like Bluebeam or DigEplan. You need this decision first because it determines the rest of the setup path.",
        buildSourceWithLink("review-management-setup", "Overview", 4)
      )}
      ${buildStepHtml(
        2,
        "Set up departments, users, and user roles before configuring review definitions",
        "Departments are required because EPL filters review assignments by department. Users and user roles must also be in place because role settings control access to Review Coordinator, reassignment, dashboards, and review administration.",
        `${buildSourceWithLink("review-management-setup", "Departments", 7)}; ${buildSourceWithLink("review-management-setup", "User Roles", 8)}`
      )}
      ${buildStepHtml(
        3,
        "Configure teams if the client wants shared reviewer pools or team leads",
        "If the jurisdiction uses teams, create them before validating assignment behavior. Teams can be used for coordinator work and review management, and team leads can see dashboards and reassign work. This affects how item reviews are claimed and managed later.",
        `${buildSourceWithLink("review-management-setup", "Team Configuration", 12)}; ${buildSourceWithLink("manage-teams", "Manage Teams", 6)}`
      )}
      ${buildStepHtml(
        4,
        "Set up item review statuses first",
        "The setup guide says to configure item review statuses before item review types. This matters because each review type can use a default review status, so the status list needs to exist before the types are built.",
        buildSourceWithLink("review-management-setup", "Item Reviews", 13)
      )}
      ${buildStepHtml(
        5,
        "Create item review types and connect them to departments and assignment behavior",
        "Item review types are the actual reviews that get routed during a submittal. Configure the type, associate it to the right department, and validate who should receive the work when EPL creates the review.",
        buildSourceWithLink("review-management-setup", "Item Reviews", 13)
      )}
      ${buildStepHtml(
        6,
        "Validate assignment priority rules so reviews land with the right person or team",
        "The setup guide documents assignment priority under MTGRADPU. EPL can assign based on team or individual configuration. Test this deliberately so the client does not discover bad routing only after they go live.",
        buildSourceWithLink("review-management-setup", "Item Review Assignment Priorities (MTGRADPU)", 5)
      )}
      ${buildStepHtml(
        7,
        "Configure submittal statuses, submittal types, and review sets",
        "Submittal setup defines how records move into review and what reviews are required. These settings shape the overall review package that reviewers and coordinators will work with.",
        buildSourceWithLink("review-management-setup", "Submittals", 17)
      )}
      ${buildStepHtml(
        8,
        "Set up corrections and related review outputs",
        "If the jurisdiction wants structured review comments, configure review correction categories and correction types. Also consider whether conditions and recommendations will be used because they affect how reviewers communicate outcomes.",
        `${buildSourceWithLink("review-management-setup", "Review Corrections", 22)}; ${buildSourceWithLink("review-management-setup", "Conditions", 24)}`
      )}
      ${buildStepHtml(
        9,
        "If this is eReviews, configure the eReview settings and tasks",
        "For eReviews, continue into the eReview-specific configuration. The guide calls out system settings and task configuration for Review New Files, Review Failed Submittal, and Review Approved Submittal. These tasks support the Review Coordinator process.",
        `${buildSourceWithLink("review-management-setup", "System Settings for eReviews", 35)}; ${buildSourceWithLink("review-management-setup", "Task Configuration", 36)}`
      )}
      ${buildStepHtml(
        10,
        "Configure file management settings for review files",
        "Set up file status, file categories, allowed file types, and file sets. These settings are what EPL uses to distinguish active eReview files from ordinary attachments and manage them through versioned review cycles.",
        buildSourceWithLink("review-management-setup", "File Configuration", 47)
      )}
      ${buildStepHtml(
        11,
        "Configure Civic Access if applicants will submit or respond online",
        "If customers are expected to upload files, acknowledge corrections, or track review progress online, Civic Access settings must be aligned with the EPL review configuration.",
        buildSourceWithLink("review-management-setup", "Civic Access Settings", 52)
      )}
      ${buildStepHtml(
        12,
        "Attach the review process to workflow and case types",
        "The Workflow Setup Guide says you create actions, create steps, build the workflow template, and then attach the template to the case or work class type. The review setup is not complete until the workflow is actually attached to the case type that will use it.",
        `${buildSourceWithLink("workflow-setup", "Suggested Setup Order", 3)}; ${buildSourceWithLink("workflow-setup", "Workflow Templates", 15)}`
      )}
      ${buildStepHtml(
        13,
        "Validate the setup from both the coordinator and reviewer side",
        "After setup, test whether the coordinator can receive and work tasks and whether reviewers can see assigned work in Manage My Reviews. A technically complete configuration is still incomplete if the user workflow does not function end to end.",
        `${buildSourceWithLink("review-coordinator", "Overview", 3)}; ${buildSourceWithLink("manage-my-reviews-bluebeam", "Manage My Reviews", 4)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Manage My Reviews", 5)}`
      )}
    </ol>
    <p><strong>If you mean a more specific setup path</strong><br>Ask one of these and I can make it even more exact: <code>set up standard reviews</code>, <code>set up eReviews</code>, <code>set up Review Coordinator</code>, <code>set up reviewer assignments</code>, <code>set up DigEplan</code>, or <code>set up Bluebeam</code>.</p>
  `;
}

function buildGeneralReviewerWorkflowAnswer() {
  return `
    <p>This is the step-by-step EPL reviewer workflow for completing an assigned review. Use this when the question is about how a reviewer works in the software, rather than how an administrator configures it.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Open Manage My Reviews from the EPL home page",
        "From the EPL home page, search for reviews and open Manage My Reviews. This app serves as the reviewer's task list and shows the incomplete reviews assigned to that user.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Navigation", 3)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Navigation", 4)}`
      )}
      ${buildStepHtml(
        2,
        "Find the review card and decide whether you need a quick action or the full review",
        "The review list allows the reviewer to reassign, update, or launch a review. Quick updates are useful for a simple status change, but the full review should be launched when the reviewer needs to inspect files, corrections, recommendations, or other review detail.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Manage My Reviews", 4)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Manage My Reviews", 5)}`
      )}
      ${buildStepHtml(
        3,
        "Open the full review and inspect the review context",
        "The full review screen shows the parent case, submittal information, due timing, and tabs such as attachments, eReview files, corrections, recommendations, and review summary. Reviewers should orient themselves here before making comments or completing work.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Header", 12)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Tab Overview", 16)}`
      )}
      ${buildStepHtml(
        4,
        "Start in the correct tab based on the kind of review",
        "For a standard review, begin with the Attachments tab. For an electronic review, begin with the eReview Files tab. This is a key distinction because standard and electronic review workflows are not the same.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Perform Review", 25)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Perform Review", 28)}`
      )}
      ${buildStepHtml(
        5,
        "Open the markup tool if the jurisdiction uses an electronic review integration",
        "If the jurisdiction uses Bluebeam, open the Studio Session. If it uses DigEplan, open the DigEplan Project. The user guides explain that this is where the actual file markups happen for eReviews.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "eReview Files", 25)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Perform Review", 28)}`
      )}
      ${buildStepHtml(
        6,
        "Create formal corrections when the applicant must fix something before approval",
        "Use the Corrections tab for issues that must be addressed. The guides say unresolved corrections prevent approval, which makes corrections the right tool for required applicant changes.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Corrections", 30)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Corrections", 34)}`
      )}
      ${buildStepHtml(
        7,
        "Use recommendations for helpful notes that do not block approval",
        "Recommendations are appropriate for explanatory guidance or narrative comments that should go back to the applicant but should not hold up approval.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Recommendations", 33)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Recommendations", 37)}`
      )}
      ${buildStepHtml(
        8,
        "Request resubmittal when revised files are required",
        "If the file set must come back revised, update the file status to Request for Resubmittal and provide resubmittal instructions. This tells the coordinator and applicant what needs to come back before the review can proceed.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Request for Resubmittal", 27)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Request for Resubmittal", 31)}`
      )}
      ${buildStepHtml(
        9,
        "Review the full submittal context before finishing",
        "Use review summary and related tabs to inspect the overall submittal and other reviews tied to it. This helps the reviewer avoid working in isolation from the rest of the case review.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Review Summary", 36)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Review Summary", 40)}`
      )}
      ${buildStepHtml(
        10,
        "Complete the review or update the review status",
        "When the work is done, complete the item review or update the status in EPL. If required corrections are unresolved, approval will not be available.",
        `${buildSourceWithLink("manage-my-reviews-bluebeam", "Complete Review (Quick), Update Status", 11)}; ${buildSourceWithLink("manage-my-reviews-digeplan", "Complete Review (Quick), Update Status", 14)}`
      )}
    </ol>
  `;
}

function buildReassignReviewAnswer() {
  const isDigEplan = state.vendor === "digeplan";
  const guideId = isDigEplan ? "manage-my-reviews-digeplan" : "manage-my-reviews-bluebeam";
  const pageReassign = isDigEplan ? 8 : 6;
  const pageList = isDigEplan ? 4 : 2;
  const pageBulk = isDigEplan ? 9 : 7;
  const pageBulkEdit = isDigEplan ? 10 : 8;
  const vendorText = state.vendor ? ` using ${sentenceCaseVendor(state.vendor)}` : "";
  return `
    <p>Here are the detailed step-by-step instructions for reassigning a review${vendorText} in EPL. This is the normal reviewer path from <strong>Manage My Reviews</strong>, plus the key permission and bulk-reassign notes people usually miss.</p>
    ${buildPlaybookSection(
      "Before You Start",
      buildBulletList([
        `Open <strong>Manage My Reviews</strong>. That app shows the incomplete reviews assigned to the reviewer and is where the individual reassign action is performed. Source: ${buildSourceWithLink(guideId, "Manage My Reviews", pageList)}`,
        `The user role must allow item review reassignment. If that permission is not enabled, the user may not be able to use the Assign action. Source: ${buildSourceWithLink("review-management-setup", "Section 8", 8)}`,
        "Only eligible reviewers appear in the assignment list, so if the expected user is missing, the issue is usually role, department, or qualification setup rather than the reassign screen itself.",
      ])
    )}
    ${buildPlaybookSection(
      "Step-By-Step",
      `
        <ol>
          ${buildStepHtml(
            1,
            "Open Manage My Reviews and locate the review you want to move",
            "Search for <strong>Manage My Reviews</strong> from the EPL menu and open it. By default, EPL shows incomplete reviews, with overdue and upcoming reviews near the top. Find the specific review card you want to reassign.",
            buildSourceWithLink(guideId, "Manage My Reviews", pageList)
          )}
          ${buildStepHtml(
            2,
            "Expand the card if you need to confirm you have the right review",
            "Click the card to expand it if you want to verify the parent case, submittal version, application date, or current review status before moving it. If you already know it is the correct one, you can also use the hover action instead.",
            buildSourceWithLink(guideId, "Manage My Reviews", pageList)
          )}
          ${buildStepHtml(
            3,
            "Click Assign from the review card",
            "Either click the expanded card's <strong>Assign</strong> action or hover over the review and click <strong>Assign</strong>. EPL then opens the eligible reviewer list for that item review.",
            buildSourceWithLink(guideId, "Reassign Review", pageReassign)
          )}
          ${buildStepHtml(
            4,
            "Choose the reviewer who should now own the review",
            "Select the user who should complete the review. The list only shows reviewers EPL considers eligible for that assignment, so choose the person who should take over the work.",
            buildSourceWithLink(guideId, "Reassign Review", pageReassign)
          )}
          ${buildStepHtml(
            5,
            "Confirm the review drops off the former reviewer's list",
            "After reassignment, EPL no longer displays that review in the former reviewer's list. That is the expected confirmation that the ownership moved successfully.",
            buildSourceWithLink(guideId, "Reassign Review", pageReassign)
          )}
          ${buildStepHtml(
            6,
            "If you need to move several reviews at once, use bulk reassign instead",
            buildInlineSteps([
              "1. Click an avatar to select one review.",
              "2. Select any additional reviews that should move to the same person.",
              "3. Click <strong>Edit</strong> to open the bulk edit popup.",
              "4. Clear the current <strong>User</strong> value and select the new reviewer.",
              "5. Update the due date if needed.",
              "6. Click <strong>Update</strong> to apply the reassignment to all selected reviews.",
            ]),
            `${buildSourceWithLink(guideId, "Bulk Reassign Reviews", pageBulk)}; ${buildSourceWithLink(guideId, "Bulk Reassign Reviews", pageBulkEdit)}`
          )}
        </ol>
      `
    )}
    ${buildPlaybookSection(
      "Validation",
      `
        <ol>
          <li>Refresh or reopen <strong>Manage My Reviews</strong>.</li>
          <li>Confirm the review is gone from the original reviewer's list.</li>
          <li>Have the new reviewer open their review list and confirm the review now appears there.</li>
          <li>If the new reviewer was not available in the picker, check reassignment permission and reviewer eligibility setup.</li>
        </ol>
      `
    )}
    ${buildPlaybookSection(
      "Best Practices",
      buildBulletList([
        "Expand the review card before reassigning if there is any chance of confusing similar reviews on the same case.",
        "Use individual reassign for one-off ownership changes and bulk reassign only when several reviews truly need the same update.",
        "If reassignment is part of a frequent team-lead process, validate team lead permissions separately from standard reviewer permissions.",
      ])
    )}
    ${buildDrillDownSection("Want More Detail?", [
      "bulk reassign reviews",
      "complete a quick review",
      "open the full review",
      "check why a reviewer is not showing in the assign list",
    ])}
    ${buildPlaybookSection(
      "Sources",
      buildGroupedSources([
        { guideId, section: "Manage My Reviews", page: pageList },
        { guideId, section: "Reassign Review", page: pageReassign },
        { guideId, section: "Bulk Reassign Reviews", page: pageBulk },
        { guideId, section: "Bulk Reassign Reviews", page: pageBulkEdit },
        { guideId: "review-management-setup", section: "Section 8", page: 8 },
      ])
    )}
  `;
}

function buildQuickReviewAnswer() {
  const guideId = state.vendor === "digeplan" ? "manage-my-reviews-digeplan" : "manage-my-reviews-bluebeam";
  const page = state.vendor === "digeplan" ? 14 : 11;
  return `
    <p>Use these steps to complete a quick review from the list without opening the full item review.</p>
    <ol>
      ${buildStepHtml(1, "Open the review card", "Expand the review card or hover over it and click Complete.", buildSourceWithLink(guideId, "Complete Review (Quick), Update Status", page))}
      ${buildStepHtml(2, "Choose the status", "In the Update Item Review popup, select the status for the review.", buildSourceWithLink(guideId, "Complete Review (Quick), Update Status", page))}
      ${buildStepHtml(3, "Add comments if needed", "Type review comments if they are needed for the record or applicant communication.", buildSourceWithLink(guideId, "Complete Review (Quick), Update Status", page))}
      ${buildStepHtml(4, "Use Not Required only when appropriate", "Toggle Not Required if the item review should be skipped. This does not change the overall submittal status by itself.", buildSourceWithLink(guideId, "Complete Review (Quick), Update Status", page))}
      ${buildStepHtml(5, "Save the update", "Click Save to complete the action. The review is removed from the list.", buildSourceWithLink(guideId, "Complete Review (Quick), Update Status", page))}
    </ol>
  `;
}

function buildOpenFullReviewAnswer() {
  const guideId = state.vendor === "digeplan" ? "manage-my-reviews-digeplan" : "manage-my-reviews-bluebeam";
  const page = state.vendor === "digeplan" ? 15 : 12;
  return `
    <p>Use these steps when you need the full item review instead of a quick list action.</p>
    <ol>
      ${buildStepHtml(1, "Find the review card", "Locate the review in Manage My Reviews and expand it or hover over it.", buildSourceWithLink(guideId, "Open Review", page))}
      ${buildStepHtml(2, "Click Launch", "Click Launch to open the review in the full Manage My Reviews app.", buildSourceWithLink(guideId, "Open Review", page))}
      ${buildStepHtml(3, "Use the review tabs and header", "Review the parent case, submittal details, and the available tabs such as attachments, eReview files, corrections, and recommendations.", buildSourceWithLink(guideId, "Open Review", page))}
      ${buildStepHtml(4, "Return to the list when finished", "Use Manage My Reviews in the Omnibar or BACK TO PREVIOUS PAGE to go back to the review list.", buildSourceWithLink(guideId, "Open Review", page))}
    </ol>
  `;
}

function buildReviewNewFilesTaskAnswer() {
  return `
    <p>Use these steps to work a <strong>Review New Files</strong> task in the Review Coordinator app. This is the coordinator-side intake step that receives uploaded eReview files and prepares them for review.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Open the Review Coordinator task card",
        "In Review Coordinator, find the Review New Files task, click the card to expand it, and review the summary information. If the task is assigned to a team, you can assign it to yourself before continuing.",
        `${buildSourceWithLink("review-coordinator", "Page 29", 29)}; ${buildSourceWithLink("review-coordinator", "Task Overview", 10)}`
      )}
      ${buildStepHtml(
        2,
        "Launch the task and review the uploaded files",
        "Open the task and inspect the uploaded eReview files. Decide which files belong in the active review cycle and which ones should instead be moved to attachments or left out of the markup session.",
        `${buildSourceWithLink("review-coordinator", "Work a Task", 27)}; ${buildSourceWithLink("review-coordinator", "Page 26", 26)}`
      )}
      ${buildStepHtml(
        3,
        "Mark the files that should be reviewed",
        "Update the file status for the files that need markups so they are set to In Review. Files that do not need review can be updated to Approved or Allowed so EPL will move them to Attachments when the task is complete.",
        `${buildSourceWithLink("review-coordinator", "Page 26", 26)}; ${buildSourceWithLink("review-management-setup", "Status Definitions", 45)}`
      )}
      ${buildStepHtml(
        4,
        "Receive the submittal",
        "Open the Submittal tab and click Receive Submittal. Review or adjust the submittal details if needed before starting or syncing the review session.",
        buildSourceWithLink("review-coordinator", "Submittal", 27)
      )}
      ${buildStepHtml(
        5,
        "Start or sync the review session",
        "Use Start/Sync Bluebeam Studio Session from the overflow actions, or complete the task using the popup path that also starts the session. EPL sends any files marked In Review into the session and records the session number on the submittal.",
        `${buildSourceWithLink("review-coordinator", "Submittal", 27)}; ${buildSourceWithLink("review-coordinator", "Option 2", 28)}`
      )}
      ${buildStepHtml(
        6,
        "Complete the task and hand the review to the reviewers",
        "Once the session starts successfully and the file statuses are correct, complete the task. EPL then invites the assigned reviewers into the active review session and the submittal moves into the in-review stage.",
        `${buildSourceWithLink("review-coordinator", "Option 2", 28)}; ${buildSourceWithLink("review-coordinator", "Section 272", 272)}`
      )}
    </ol>
  `;
}

function buildCorrectionsRecommendationsAnswer() {
  const isDigEplan = state.vendor === "digeplan";
  const correctionsSource = isDigEplan
    ? buildSourceWithLink("manage-my-reviews-digeplan", "Corrections", 34)
    : buildSourceWithLink("manage-my-reviews-bluebeam", "Corrections", 30);
  const recommendationsSource = isDigEplan
    ? buildSourceWithLink("manage-my-reviews-digeplan", "Recommendations", 37)
    : buildSourceWithLink("manage-my-reviews-bluebeam", "Recommendations", 33);

  return `
    <p>Use these steps when a reviewer needs to add formal corrections or recommendations during a review.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Open the full item review",
        "From Manage My Reviews, launch the full review so you can access the detailed review tabs instead of only using the quick list actions.",
        isDigEplan
          ? buildSourceWithLink("manage-my-reviews-digeplan", "Open Review", 15)
          : buildSourceWithLink("manage-my-reviews-bluebeam", "Open Review", 12)
      )}
      ${buildStepHtml(
        2,
        "Use Corrections for issues that must be resolved",
        "Go to the Corrections tab when the applicant must fix something before approval. Corrections are the formal blocking items in the review process.",
        correctionsSource
      )}
      ${buildStepHtml(
        3,
        "Add the correction details carefully",
        "Create the correction entry and describe the required change clearly so the applicant and coordinator know what must be resolved before the review can be approved.",
        correctionsSource
      )}
      ${buildStepHtml(
        4,
        "Use Recommendations for non-blocking guidance",
        "Go to the Recommendations tab when you want to give additional guidance or explanatory notes that should not prevent approval.",
        recommendationsSource
      )}
      ${buildStepHtml(
        5,
        "Complete the review only after confirming the right review outcome",
        "Before finishing, confirm that blocking issues are captured as corrections and non-blocking notes are captured as recommendations, then complete or update the review appropriately.",
        `${correctionsSource}; ${recommendationsSource}`
      )}
    </ol>
  `;
}

function hasGuideFamily(familyNamePart) {
  return state.kb.guides.some((guide) => guide.family.includes(familyNamePart));
}

function buildMissingGuideAnswer(topicName, recommendedGuide) {
  return `
    <p>I do not have the right ${topicName} guide in the current local knowledge base yet, so I would rather not guess and give you the wrong procedure.</p>
    <p><strong>What I do know</strong><br>The current answer set has workflow references to fees, but not the dedicated fee setup instructions you would need to create and manage fees correctly.</p>
    <p><strong>What to add next</strong><br>Please add the latest <strong>${recommendedGuide}</strong> from TylerU or the EPL help source, and then I can turn it into the same step-by-step procedure format as the review workflows.</p>
  `;
}

function buildManageReviewAnswer() {
  const isDigEplan = state.vendor === "digeplan";
  const guideId = isDigEplan ? "manage-my-reviews-digeplan" : "manage-my-reviews-bluebeam";
  const pageManage = isDigEplan ? 5 : 4;
  const pageReassign = isDigEplan ? 11 : 8;
  const pageComplete = isDigEplan ? 14 : 11;
  const pageOpen = isDigEplan ? 15 : 12;
  const vendorText = state.vendor ? ` using ${sentenceCaseVendor(state.vendor)}` : "";

  return `
    <p>Here are the step-by-step instructions for managing a review${vendorText} in <strong>Manage My Reviews</strong>. This is the direct procedure from the user guide, organized so you can follow it inside the software.</p>
    <ol>
      ${buildStepHtml(
        1,
        "Open Manage My Reviews and display your review list",
        "From the EPL home page, open Manage My Reviews. The app opens in a new browser tab and acts as the reviewer's to-do list, showing incomplete reviews. By default, overdue and upcoming reviews appear at the top.",
        buildSourceWithLink(guideId, "Manage My Reviews", pageManage)
      )}
      ${buildStepHtml(
        2,
        "Choose how you want to view the list",
        "Click List to display the reviews in a list, or click Grid to display them in a grid. Each card shows basic information such as the location, parent case type and class, description, and submittal version.",
        buildSourceWithLink(guideId, "Manage My Reviews", pageManage)
      )}
      ${buildStepHtml(
        3,
        "Expand a review card to see more information",
        "Click a card to expand it and view more details about the review, such as the application date of the parent case, the submittal type, and the review status. This is the normal first step before deciding what action to take.",
        buildSourceWithLink(guideId, "Manage My Reviews", pageManage)
      )}
      ${buildStepHtml(
        4,
        "Reassign the review if another reviewer should complete it",
        "Click Assign on the card, or hover over the review and click Assign. EPL displays the list of eligible reviewers. Select the user who should complete the review. After reassignment, the review no longer appears in the former reviewer's list.",
        buildSourceWithLink(guideId, "Reassign Review", pageReassign)
      )}
      ${buildStepHtml(
        5,
        "Use quick update if you only need to complete or change status from the list",
        "If there is no need to open the full review, click Complete on the card or hover over the review and click Complete. In the update popup, select the review status, type comments if needed, and optionally toggle Not Required if the item review should be skipped. Then click Save. This removes the review from the list.",
        buildSourceWithLink(guideId, "Complete Review (Quick), Update Status", pageComplete)
      )}
      ${buildStepHtml(
        6,
        "Launch the full review when you need deeper detail or file access",
        "Click Launch on the card, or hover over the review and click Launch, to open the full item review. Use this path when you need parent case information, submittal detail, associated files, corrections, recommendations, or a fuller review workflow than the quick update provides.",
        buildSourceWithLink(guideId, "Open Review", pageOpen)
      )}
      ${buildStepHtml(
        7,
        "Return to the list when you are done in the full review",
        "Once the full review is open, use Manage My Reviews in the Omnibar or BACK TO PREVIOUS PAGE to return to the review list.",
        buildSourceWithLink(guideId, "Open Review", pageOpen)
      )}
    </ol>
    <p><strong>About screenshots</strong><br>The linked PDF guide includes the screenshots for these steps. I can reference the exact guide section for you, but the current app is using extracted guide text rather than embedded PDF images.</p>
  `;
}

function buildFeeSetupAnswer() {
  return `
    <p>Here are the detailed step-by-step instructions for setting up fees in EPL.</p>
    ${buildPlaybookSection(
      "Step-By-Step",
      `
        <ol>
          ${buildStepHtml(
            1,
            "Set up the fee prerequisites in Cashier",
            "Before building the fee itself, confirm the supporting setup exists. At minimum, verify the needed fee schedules, payment methods, and GL accounts are configured because EPL uses those pieces when the fee is created and maintained.",
            `${buildSourceWithLink("fee", "Section 117", 117)}; ${buildSourceWithLink("fee", "Section 126", 126)}; ${buildSourceWithLink("fee", "Section 146", 146)}`
          )}
          ${buildStepHtml(
            2,
            "Create the fee in the Fee Setup app",
            buildInlineSteps([
              "1. In the Omnibar, type <strong>fees</strong> and open the Fee Setup app.",
              "2. Search the existing fee list first so you do not create a duplicate fee record.",
              "3. If the fee already exists, click <strong>Launch</strong> to modify it. If it does not exist, click <strong>Add New</strong>.",
              "4. On the <strong>Details</strong> tab, enter the <strong>Fee Name</strong>. This is the name users will see on the case, invoice, receipt, and when the fee is added to a template.",
              "5. Select the <strong>Fee Type</strong>. Use <strong>Fixed</strong> for a flat fee, <strong>Calculated</strong> for a fee charged per unit, <strong>Adjustable</strong> for range-based charges, <strong>Percentage</strong> for a percent-based fee, or <strong>Late Fee</strong> for late-charge behavior.",
              "6. Enter the <strong>Description</strong> and <strong>Notes</strong>. These are useful later because they display in fee setup, templates, reports, and case fee screens.",
              "7. If the client is integrated with Enterprise ERP, select the <strong>Charge Code</strong>. If they are not, leave that field out of scope and rely on GL or AR account setup instead.",
              "8. Review optional toggles on the Details tab only if the fee truly needs them, such as fee waivers, CPI increase, compounding interest, or fee proration.",
            ]),
            `${buildSourceWithLink("fee", "Fee Setup Overview", 159)}; ${buildSourceWithLink("fee", "Section 233", 233)}; ${buildSourceWithLink("fee", "Section 235", 235)}; ${buildSourceWithLink("fee", "Section 244", 244)}`
          )}
          ${buildStepHtml(
            3,
            "Complete the Fee Setups tab so EPL knows how to calculate the amount",
            buildInlineSteps([
              "1. Open the <strong>Fee Setups</strong> tab.",
              "2. Select the <strong>Fee Schedule</strong> that controls when the amount is active.",
              "3. If the fee type is <strong>Fixed</strong> or <strong>Calculated</strong>, enter the <strong>Amount</strong> EPL should charge.",
              "4. If the fee type is <strong>Percentage</strong>, enter the <strong>Percentage</strong> EPL should apply to the input.",
              "5. If the fee type is <strong>Calculated</strong> or <strong>Percentage</strong>, enter the <strong>Computation Value</strong> and <strong>Computation Value Name</strong>. This is what tells EPL how to interpret the input, such as per page, per square foot, or per circuit.",
              "6. If needed, enter <strong>Minimum</strong> and <strong>Maximum</strong> values so the fee cannot calculate below or above a defined limit.",
              "7. If the fee needs special rounding, set the <strong>Round Fee</strong> method and <strong>Round Fee Value</strong>. If the input itself needs rounding, that is handled later on the fee template rather than here.",
              "8. If the fee uses CPI or proration, complete the extra CPI Type, Proration Model, or Proration Schedule fields that appear based on the toggles selected on the Details tab.",
            ]),
            `${buildSourceWithLink("fee", "Fee Setups", 202)}; ${buildSourceWithLink("fee", "Section 254", 254)}; ${buildSourceWithLink("fee", "Section 271", 271)}; ${buildSourceWithLink("fee", "Section 272", 272)}; ${buildSourceWithLink("fee", "Section 273", 273)}; ${buildSourceWithLink("fee", "Section 274", 274)}; ${buildSourceWithLink("fee", "Section 277", 277)}`
          )}
          ${buildStepHtml(
            4,
            "Finish the other tabs that control where and how the fee can be used",
            buildInlineSteps([
              "1. Open the <strong>Payment Methods</strong> tab and enable the methods customers or staff can use to pay this fee.",
              "2. If the jurisdiction uses GL accounts, populate the <strong>GL Debit</strong> and <strong>GL Credit</strong> accounts where required.",
              "3. If the jurisdiction counts the fee as income at invoicing time, complete the <strong>AR Accounts</strong> setup as well.",
              "4. Save the fee once the Details, Fee Setups, and account-related tabs are complete.",
            ]),
            `${buildSourceWithLink("fee", "Payment Methods", 224)}; ${buildSourceWithLink("fee", "Section 410", 410)}; ${buildSourceWithLink("fee", "Section 451", 451)}; ${buildSourceWithLink("fee", "Section 457", 457)}`
          )}
          ${buildStepHtml(
            5,
            "Create the fee template that will group the fees together",
            "Open the Fee Template Setup app and create or modify the template that should apply to the permit. Select the Template Module before adding fees so EPL knows which module the template belongs to. Then add the fees that should be available or automatically used for that case type.",
            `${buildSourceWithLink("fee", "Section 523", 523)}; ${buildSourceWithLink("fee", "Section 608", 608)}`
          )}
          ${buildStepHtml(
            6,
            "Add conditions or special template logic if the fees should not always fire",
            "If some fees should calculate only in certain situations, configure fee conditions on the template. The guide recommends building the template with the possible fees and then using conditions and any needed Intelligent Object automation so EPL applies the correct fee at the correct time.",
            `${buildSourceWithLink("fee", "Section 627", 627)}; ${buildSourceWithLink("fee", "Section 628", 628)}; ${buildSourceWithLink("fee", "Section 634", 634)}`
          )}
          ${buildStepHtml(
            7,
            "Attach the fee template to the permit type and work class",
            "Open Permit Type Setup, go to the permit type and work class combination, and assign the workflow template, custom field layout, and fee template. EPL determines the workflow, custom fields, and fees at the work class level, so the fee template is not active for that permit until it is attached here.",
            `${buildSourceWithLink("permit-management", "Section 109", 109)}; ${buildSourceWithLink("permit-management", "Section 240", 240)}; ${buildSourceWithLink("permit-management", "Section 260", 260)}`
          )}
          ${buildStepHtml(
            8,
            "Test the fee on a real permit scenario",
            "After the template is attached, create a test permit using that permit type and work class. Confirm the expected fees appear and, if the fee depends on conditions or automation, confirm the related Intelligent Object or automation path is also triggering correctly.",
            `${buildSourceWithLink("fee", "Section 646", 646)}; ${buildSourceWithLink("permit-management", "Section 109", 109)}`
          )}
        </ol>
      `
    )}

    ${buildPlaybookSection(
      "Validation",
      buildBulletList([
        "Create a test permit using the exact permit type and work class you configured.",
        "Verify the expected fee template is the one attached to that work class.",
        "Confirm the fees appear with the right amount, date range, and payment options.",
        "If the fee is calculated or conditional, confirm the input fields and automation are actually causing the fee to fire.",
        "If online apply is in scope, test the same scenario in Civic Access as well.",
      ])
    )}

    ${buildPlaybookSection(
      "Best Practice",
      `<p>Use fee templates as the reusable layer and keep the permit type/work class assignment clean. In EPL, the case type and work class combination is what decides which workflow, custom fields, and fees the user or applicant sees, so it is usually safer to maintain the fee logic in the template and then attach the correct template to the work class.</p>`
    )}
    ${buildDrillDownSection("Want More Detail?", [
      "create the fee template",
      "attach the fee template to a permit type and work class",
      "configure fee conditions or automation",
      "test the fee in Civic Access or a permit case",
    ])}
    ${buildPlaybookSection(
      "Background And Sources",
      `
        <p>Setting up fees in EPL is usually a two-part process: first you configure the fee and fee template in the Cashier tools, then you attach that fee template to the permit type and work class that should use it.</p>
        <p>For permit setup, EPL expects several related components to be in place before the final permit type and work class configuration is complete.</p>
        ${buildBulletList([
          `Set up the workflow template that will drive the permit process. Source: ${buildSourceWithLink("permit-management", "Section 258", 258)}`,
          `Set up the custom field layout that the permit and work class will use. Source: ${buildSourceWithLink("permit-management", "Section 259", 259)}`,
          `Set up fees and fee templates before attaching the permit type and work class. Source: ${buildSourceWithLink("permit-management", "Section 131", 131)}`,
          `Set up contact types and related validation before completing the work class setup. Source: ${buildSourceWithLink("permit-management", "Section 127", 127)}`,
        ])}
      `
    )}
  `;
}

function buildPermitTypeSetupAnswer() {
  return `
    <p>Creating a <strong>permit type</strong> in EPL is usually a two-layer setup: first you create the permit type record itself, then you add one or more <strong>work classes</strong> under that type. The work class is what actually controls the workflow, custom fields, fees, contact rules, and online application behavior.</p>
    <p>In other words, the permit type is the parent record, but the work class is where most of the operational setup happens.</p>
    ${buildPlaybookSection(
      "Before You Start",
      buildBulletList([
        "Set up permit statuses before you create the permit type, because EPL uses them for the default status and online status fields.",
        "Create the work classes you plan to attach before you build the final permit type/work class combination.",
        "Have the workflow template, custom field layout, fee template, and contact-type strategy ready before finishing the work class setup.",
        "If the permit will be available online, decide in advance whether the customer should pay first, review first, or use another online application flow.",
      ])
    )}
    ${buildPlaybookSection(
      "Step-By-Step",
      `
        <ol>
          ${buildStepHtml(
            1,
            "Open Permit Type Setup and decide whether you are creating a new type or editing an existing one",
            "In the Omnibar, open <strong>Permit Type Setup</strong>. Search the existing list first so you do not create a duplicate permit type. If the type already exists, open it and update it. If it does not exist, click <strong>Add New</strong>.",
            `${buildSourceWithLink("permit-management", "Section 108", 108)}; ${buildSourceWithLink("permit-management", "Section 240", 240)}`
          )}
          ${buildStepHtml(
            2,
            "Complete the core permit type identity fields on the Details tab",
            buildInlineSteps([
              "1. Enter the <strong>Permit Type Name</strong>. This is the internal case type name staff will use.",
              "2. Enter the <strong>Permit Prefix</strong>. EPL uses this with the numbering scheme to build the permit number.",
              "3. Select the <strong>Permit Type Group</strong> if the jurisdiction wants to group similar permit types for reporting or Hub charts.",
              "4. Select a <strong>Default Case Assigned To</strong> user if one person should normally own new permits of this type.",
              "5. Enter the <strong>Friendly Name</strong>. This is the customer-facing or document-facing label and is often clearer than the internal permit type name.",
            ]),
            `${buildSourceWithLink("permit-management", "Section 190", 190)}; ${buildSourceWithLink("permit-management", "Section 191", 191)}; ${buildSourceWithLink("permit-management", "Section 192", 192)}; ${buildSourceWithLink("permit-management", "Section 193", 193)}; ${buildSourceWithLink("permit-management", "Section 194", 194)}`
          )}
          ${buildStepHtml(
            3,
            "Set the status and expiration behavior for the permit type",
            buildInlineSteps([
              "1. Select the <strong>Default Status</strong> for back-office permit creation.",
              "2. If the permit will be used online, select the <strong>Default Internet Status</strong>. This is required for Civic Access permit applications.",
              "3. If the permit should expire, enter <strong>Days Until Expire</strong>.",
              "4. If inspections should extend or influence expiration timing, enter <strong>Days Until Expire from Last Inspect</strong>.",
              "5. If the permit uses certificate behavior, choose the <strong>Certificate Type</strong> that should display on the permit.",
            ]),
            `${buildSourceWithLink("permit-management", "Section 197", 197)}; ${buildSourceWithLink("permit-management", "Section 198", 198)}; ${buildSourceWithLink("permit-management", "Section 195", 195)}; ${buildSourceWithLink("permit-management", "Section 196", 196)}; ${buildSourceWithLink("permit-management", "Section 211", 211)}`
          )}
          ${buildStepHtml(
            4,
            "Turn on only the permit-type options the jurisdiction truly needs",
            buildInlineSteps([
              "1. Toggle <strong>Active</strong> on if users or applicants should be able to select this permit type.",
              "2. Turn on <strong>Allow Internet Submission</strong> only if customers should apply for this permit in Civic Access.",
              "3. If the jurisdiction uses valuation or square-foot logic, turn on <strong>Valuation Control</strong>, <strong>Require Valuation</strong>, and/or <strong>Square Feet Control</strong> as needed.",
              "4. Turn on <strong>Commercial</strong> or <strong>Residential</strong> only if those controls are part of the jurisdiction's licensing or valuation rules.",
              "5. Review any eReview-related file resubmission settings only if this permit type will participate in the eReviews process.",
            ]),
            `${buildSourceWithLink("permit-management", "Section 218", 218)}; ${buildSourceWithLink("permit-management", "Section 230", 230)}; ${buildSourceWithLink("permit-management", "Section 223", 223)}; ${buildSourceWithLink("permit-management", "Section 229", 229)}; ${buildSourceWithLink("permit-management", "Section 224", 224)}; ${buildSourceWithLink("permit-management", "Section 221", 221)}; ${buildSourceWithLink("permit-management", "Section 226", 226)}; ${buildSourceWithLink("permit-management", "Section 203", 203)}`
          )}
          ${buildStepHtml(
            5,
            "Finish numbering and save the permit type record",
            "Enter the <strong>Case Type Numbering Scheme</strong> and the <strong>Case Number Pad to Digits</strong> value. Then save the permit type. At this point you have the parent permit type record, but the setup is not complete until at least one work class is attached.",
            `${buildSourceWithLink("permit-management", "Section 233", 233)}; ${buildSourceWithLink("permit-management", "Section 234", 234)}; ${buildSourceWithLink("permit-management", "Section 240", 240)}`
          )}
          ${buildStepHtml(
            6,
            "Open the Work Classes tab and add the work class that should be available under this permit type",
            "Go to the <strong>Work Classes</strong> tab, click <strong>Add New</strong>, and select the work class that belongs under this permit type. EPL requires at least one work class on the permit type because the type/work class combination is what drives the actual case behavior.",
            `${buildSourceWithLink("permit-management", "Section 240", 240)}; ${buildSourceWithLink("permit-management", "Section 246", 246)}`
          )}
          ${buildStepHtml(
            7,
            "Configure the work class behavior that controls how staff and applicants use the permit",
            buildInlineSteps([
              "1. Leave <strong>Active</strong> on if the work class should be selectable when a permit is created.",
              "2. Select the <strong>Default Assigned To</strong> user if cases for this work class normally route to a specific person.",
              "3. Select the required <strong>Workflow Template</strong>. EPL requires a workflow on the permit type/work class combination.",
              "4. Select the required <strong>Custom Field Layout</strong>. This controls the Additional Info fields users and applicants see.",
              "5. Select the correct <strong>Fee Template</strong> so the permit can calculate and display the right fees.",
            ]),
            `${buildSourceWithLink("permit-management", "Section 248", 248)}; ${buildSourceWithLink("permit-management", "Section 250", 250)}; ${buildSourceWithLink("permit-management", "Section 258", 258)}; ${buildSourceWithLink("permit-management", "Section 259", 259)}; ${buildSourceWithLink("permit-management", "Section 260", 260)}`
          )}
          ${buildStepHtml(
            8,
            "Configure the online behavior on the work class if customers will apply online",
            buildInlineSteps([
              "1. Toggle <strong>Allow Online</strong> on for the work class.",
              "2. If online applications must include an address, toggle <strong>Online Address Required</strong> on.",
              "3. Select the <strong>Online Apply Type</strong> that matches the jurisdiction's process.",
              "4. Use <strong>Pay First</strong> when the customer should apply and pay immediately online.",
              "5. Use <strong>Review First</strong> when the customer should apply first and pay only after the jurisdiction reviews or issues the permit.",
            ]),
            `${buildSourceWithLink("permit-management", "Section 262", 262)}; ${buildSourceWithLink("permit-management", "Section 263", 263)}; ${buildSourceWithLink("permit-management", "Section 264", 264)}; ${buildSourceWithLink("permit-management", "Section 265", 265)}; ${buildSourceWithLink("permit-management", "Section 266", 266)}`
          )}
          ${buildStepHtml(
            9,
            "Finish the related tabs that make the permit usable in production",
            "After the work class basics are saved, continue with the other tabs that apply to the process, such as <strong>Contact Types</strong>, certification or license validation, allowed activity types, online file types, and any eReview file requirements. These are also controlled at the work-class level.",
            `${buildSourceWithLink("permit-management", "Section 240", 240)}; ${buildSourceWithLink("permit-management", "Section 400", 400)}; ${buildSourceWithLink("permit-management", "Section 434", 434)}`
          )}
          ${buildStepHtml(
            10,
            "Test the full type/work class combination with a real permit scenario",
            "Create a sample permit using the new permit type and work class. Confirm the status, workflow, Additional Info fields, fees, contacts, and online behavior all match the intended process. This is the safest way to validate that the type and work class are wired together correctly.",
            `${buildSourceWithLink("permit-management", "Section 109", 109)}; ${buildSourceWithLink("permit-management", "Section 240", 240)}; ${buildSourceWithLink("permit-management", "Section 262", 262)}`
          )}
        </ol>
      `
    )}
    ${buildPlaybookSection(
      "How EPL Behaves",
      buildBulletList([
        "The permit type and work class combination determines the workflow, custom fields, fees, and other case behavior.",
        "EPL requires each permit type/work class combination to have a workflow template and a custom field layout.",
        "After a permit is saved the first time, the Permit Type and Work Class fields normally lock because changing them later could break the workflow, fees, and data structure.",
        "If no work class is attached, the permit type is not functionally complete for case creation.",
      ])
    )}
    ${buildPlaybookSection(
      "Validation",
      `
        <ol>
          <li>Create a test permit using the new permit type and work class.</li>
          <li>Verify the correct default status and assignee populate.</li>
          <li>Confirm the expected workflow starts.</li>
          <li>Open Additional Info and confirm the expected custom fields display.</li>
          <li>Check that the correct fees and contact rules appear.</li>
          <li>If online apply is enabled, test the same path in Civic Access.</li>
        </ol>
      `
    )}
    ${buildPlaybookSection(
      "Best Practices",
      buildBulletList([
        "Design the work class structure first, because that is where EPL actually controls most permit behavior.",
        "Use a clear internal Permit Type Name and a simpler Friendly Name for customer-facing output.",
        "Keep workflow, custom fields, fees, and contacts aligned for each work class so users do not get mixed rules.",
        "Do not turn on online settings until the back-office type/work class setup is already tested.",
        "Test with one realistic permit scenario before rollout instead of relying only on the setup screens.",
      ])
    )}
    ${buildDrillDownSection("Want More Detail?", [
      "assign workflow, custom fields, and fees to a permit work class",
      "configure permit contact types",
      "configure online apply settings for a permit work class",
      "test a permit setup with a sample case",
    ])}
    ${buildPlaybookSection(
      "Sources",
      buildGroupedSources([
        { guideId: "permit-management", section: "Section 84", page: 84 },
        { guideId: "permit-management", section: "Section 109", page: 109 },
        { guideId: "permit-management", section: "Section 190", page: 190 },
        { guideId: "permit-management", section: "Section 197", page: 197 },
        { guideId: "permit-management", section: "Section 198", page: 198 },
        { guideId: "permit-management", section: "Section 230", page: 230 },
        { guideId: "permit-management", section: "Section 240", page: 240 },
        { guideId: "permit-management", section: "Section 258", page: 258 },
        { guideId: "permit-management", section: "Section 259", page: 259 },
        { guideId: "permit-management", section: "Section 260", page: 260 },
        { guideId: "permit-management", section: "Section 262", page: 262 },
        { guideId: "permit-management", section: "Section 264", page: 264 },
      ])
    )}
  `;
}

function buildClarifyingQuestion(title, prompt, options) {
  return `
    <p><strong>${title}</strong></p>
    <p>${prompt}</p>
    ${buildBulletList(options)}
  `;
}

function genericClarification(question, options = {}) {
  const { wasDownvoted = false } = options;
  const lowered = question.toLowerCase().trim();
  const topic = questionTopicLabel(question);
  const isBroadHowQuestion =
    /^how do i /.test(lowered) ||
    /^how does /.test(lowered) ||
    /^how to /.test(lowered) ||
    /^set up /.test(lowered) ||
    /^configure /.test(lowered) ||
    /^manage /.test(lowered);
  const tokenCount = tokenize(question).length;
  const isGeneric = tokenCount <= 6 || isBroadHowQuestion;

  if (!isGeneric) {
    return null;
  }

  if (topic === "workflow") {
    return buildClarifyingQuestion(
      wasDownvoted ? "Let’s make this more specific" : "I can narrow that down",
      wasDownvoted
        ? "The earlier answer on this workflow question was not specific enough. Which exact workflow task do you want?"
        : "Workflow questions are usually easier to answer if we focus on one part. Which workflow task do you want?",
      [
        "Create workflow steps",
        "Create workflow actions",
        "Build the workflow template",
        "Attach workflow to a case type or work class",
      ]
    );
  }

  if (topic === "inspections") {
    return buildClarifyingQuestion(
      wasDownvoted ? "Let’s make this more specific" : "I can narrow that down",
      wasDownvoted
        ? "The earlier answer on this inspection question was not specific enough. Which exact inspection task do you want?"
        : "Inspection setup can mean a few different things. Which part do you want?",
      [
        "Set up inspection case types",
        "Set up inspection types",
        "Assign inspections through workflow",
        "Test inspection scheduling and results",
      ]
    );
  }

  if (topic === "Civic Access") {
    return buildClarifyingQuestion(
      wasDownvoted ? "Let’s make this more specific" : "I can narrow that down",
      wasDownvoted
        ? "The earlier answer on this Civic Access question was not specific enough. Which exact Civic Access area do you want?"
        : "Civic Access is broad. Which part of the process do you want help with?",
      [
        "Set up Civic Access options for a process",
        "Configure online file or payment behavior",
        "Validate the customer experience step by step",
        "Test a workflow in Civic Access",
      ]
    );
  }

  if (topic === "reviews" && !state.role) {
    return buildClarifyingQuestion(
      wasDownvoted ? "Let’s make this more specific" : "I can narrow that down",
      wasDownvoted
        ? "The earlier review answer was not specific enough. Which exact review task do you want?"
        : "Review questions can mean setup, coordinator work, or reviewer work. Which one do you want?",
      [
        "Set up reviews in EPL",
        "Manage or reassign reviews",
        "Review Coordinator workflow",
        "Full end-to-end eReview process",
      ]
    );
  }

  if ((topic === "permits" || topic === "contacts" || topic === "fees") && isBroadHowQuestion) {
    return null;
  }

  if (isTrulyAmbiguousQuestion(question)) {
    return buildClarifyingQuestion(
      wasDownvoted ? "Let’s make this more specific" : "I can narrow that down",
      wasDownvoted
        ? "The earlier answer was too broad. Which exact area do you want help with this time?"
        : "That question is still broad. Which area do you want help with?",
      [
        "Fees",
        "Permits or work classes",
        "Contacts or validation",
        "Reviews or eReviews",
      ]
    );
  }

  return null;
}

function buildDrillDownSection(title, prompts) {
  return buildPlaybookSection(
    title,
    buildBulletList(
      prompts.map(
        (prompt) =>
          `<button type="button" class="inline-question" data-question="${escapeHtml(prompt)}">Would you like me to show you how to <code>${prompt}</code>?</button>`
      )
    )
  );
}

function suggestedDrillDownPrompts(question, chunks) {
  const lowered = question.toLowerCase();
  const families = new Set(chunks.map((chunk) => chunk.guide_family));
  const prompts = [];

  if (/\bfees?\b/.test(lowered) || families.has("fee")) {
    prompts.push(
      "create the fee template",
      "attach the fee template to a permit type and work class",
      "configure fee conditions or automation",
      "test the fee in Civic Access or a permit case"
    );
  }

  if (/\bpermits?\b/.test(lowered) || families.has("permit-management")) {
    prompts.push(
      "set up permit types and work classes",
      "assign workflow, custom fields, and fees to a permit work class",
      "configure permit contact types",
      "test a permit setup with a sample case"
    );
  }

  if (/\bcontacts?\b/.test(lowered) || families.has("contact-management")) {
    prompts.push(
      "set up land management contact types",
      "configure certification or license validation",
      "attach contact types to a work class",
      "test contact validation on a case"
    );
  }

  if (/\bworkflow\b/.test(lowered) || families.has("workflow")) {
    prompts.push(
      "create workflow steps",
      "create workflow actions",
      "build the workflow template",
      "attach the workflow template to a case type or work class"
    );
  }

  if (/\breviews?\b/.test(lowered) || families.has("review-management")) {
    prompts.push(
      "configure item review statuses and types",
      "set up review coordinator tasks",
      "assign reviews to teams or reviewers",
      "test the review workflow end to end"
    );
  }

  if (/\binspections?\b/.test(lowered) || families.has("inspection-management")) {
    prompts.push(
      "set up inspection case types",
      "set up inspection types",
      "assign inspections through workflow",
      "test inspection scheduling and results"
    );
  }

  if (/\bcivic access\b/.test(lowered) || families.has("civic-access")) {
    prompts.push(
      "set up Civic Access options for this process",
      "test the workflow in Civic Access",
      "configure online file or payment behavior",
      "validate the customer experience step by step"
    );
  }

  if (!prompts.length) {
    prompts.push(
      `drill into one specific ${questionTopicLabel(question)} task in EPL`,
      "show the exact clicks and fields for the next setup step",
      `test ${questionTopicLabel(question)} end to end in EPL`
    );
  }

  return [...new Set(prompts)].slice(0, 4);
}

function buildDetailedChunkAnswer(question, chunks) {
  return buildGenericDetailedAnswer(question, chunks);
}

function rolePreferredGuideType() {
  if (state.role === "admin") {
    return "setup";
  }
  if (state.role === "coordinator" || state.role === "reviewer") {
    return "user";
  }
  return "";
}

function extractProceduralSteps(text) {
  const normalized = text.replace(/\r/g, "").replace(/\u00a0/g, " ");
  const matches = [...normalized.matchAll(/(?:^|\n)(\d+)\.\s+([\s\S]*?)(?=(?:\n\d+\.\s)|$)/g)];
  return matches
    .map((match) => {
      const body = cleanInstructionText(match[2].replace(/\n+/g, " "));
      return body;
    })
    .filter(Boolean);
}

function proceduralChunksForQuestion(chunks) {
  return chunks
    .map((chunk) => ({
      chunk,
      steps: extractProceduralSteps(chunk.text),
    }))
    .filter((item) => item.steps.length);
}

function buildProceduralGuideAnswer(question, chunks) {
  return buildGenericDetailedAnswer(question, chunks);
}

function scoreChunk(chunk, tokens, rawQuestion) {
  if (chunk.vendor !== "general" && chunk.vendor !== state.vendor) {
    return 0;
  }

  const haystack = `${chunk.section} ${chunk.text}`.toLowerCase();
  let score = chunk.vendor === state.vendor ? 6 : 4;
  const loweredQuestion = rawQuestion.toLowerCase();
  const preferredGuideType = rolePreferredGuideType();
  const feeTerms = ["fee", "fees", "fee template", "fee setup", "cashier", "cashiering", "gl account", "payment method", "fee schedule"];

  if (chunk.is_preferred_source) {
    score += 18;
  }

  if (chunk.source_priority) {
    score += Math.min(12, Math.floor(chunk.source_priority / 10));
  }

  if (preferredGuideType && chunk.guide_type === preferredGuideType) {
    score += 16;
  }

  if (state.role === "coordinator" && /coordinator|task|review new files|failed submittal|approved submittal|in review|upcoming due|overdue/.test(haystack)) {
    score += 14;
  }

  if (state.role === "reviewer" && /manage my reviews|reassign review|complete review|perform review|resubmittal|corrections|recommendations/.test(haystack)) {
    score += 14;
  }

  if (state.role === "admin" && /setup|configuration|system settings|item review|submittal|workflow|file configuration|civic access/.test(haystack)) {
    score += 14;
  }

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += chunk.section.toLowerCase().includes(token) ? 8 : 3;
    }
  }

  if (loweredQuestion.includes("resubmittal") && haystack.includes("request for resubmittal")) {
    score += 15;
  }
  if (loweredQuestion.includes("review coordinator") && guideIdMatches(chunk.guide_id, "review-coordinator")) {
    score += 15;
  }
  if (loweredQuestion.includes("setup") && chunk.category === "setup") {
    score += 12;
  }
  if (/setup|configure|configuration|administration|admin/.test(loweredQuestion) && chunk.guide_type === "setup") {
    score += 14;
  }
  if (/how do i|steps|procedure|manage|complete|work a task|reviewer|coordinator/.test(loweredQuestion) && chunk.guide_type === "user") {
    score += 12;
  }
  if (loweredQuestion.includes("team") && chunk.category === "teams") {
    score += 10;
  }
  if (loweredQuestion.includes("dashboard") && chunk.category === "dashboard") {
    score += 10;
  }

  const questionMentionsFees = feeTerms.some((term) => loweredQuestion.includes(term));
  const chunkMentionsFees =
    feeTerms.some((term) => haystack.includes(term)) ||
    chunk.guide_family === "fee" ||
    chunk.guide_family === "permit-management";

  if (questionMentionsFees && chunk.guide_family === "fee") {
    score += 36;
  }
  if (questionMentionsFees && chunk.guide_family === "permit-management") {
    score += 18;
  }
  if (
    questionMentionsFees &&
    /civic access|registration|inspection type|public css url|user profile/i.test(haystack)
  ) {
    score -= 30;
  }
  if (questionMentionsFees && !chunkMentionsFees) {
    score -= 20;
  }

  const businessLicenseTerms = ["business license", "business licenses", "operational permit", "operational permits"];
  const questionMentionsBusinessLicense = businessLicenseTerms.some((term) => loweredQuestion.includes(term));
  const chunkMentionsBusinessLicense = businessLicenseTerms.some((term) => haystack.includes(term));
  if (chunkMentionsBusinessLicense && !questionMentionsBusinessLicense) {
    score -= 18;
  }

  const digEplanTerms = ["digeplan"];
  const bluebeamTerms = ["bluebeam", "studio session", "revu"];
  if (digEplanTerms.some((term) => haystack.includes(term)) && !digEplanTerms.some((term) => loweredQuestion.includes(term)) && state.vendor !== "digeplan") {
    score -= 8;
  }
  if (bluebeamTerms.some((term) => haystack.includes(term)) && !bluebeamTerms.some((term) => loweredQuestion.includes(term)) && state.vendor !== "bluebeam") {
    score -= 8;
  }

  if (chunk.guide_type === "faq" && !/faq|can|does|availability|difference|what is|what does/.test(loweredQuestion)) {
    score -= 10;
  }

  return score;
}

function summarizeChunk(chunk) {
  const text = chunk.text.replace(/\s+/g, " ").trim();
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.slice(0, 2).join(" ").trim();
}

function answerQuestion(question) {
  const tokens = expandTokens(tokenize(question));
  const vendorSpecificQuestion = /bluebeam|digeplan|revu|studio|session|project|e-?review|ereview/i.test(question);
  const loweredQuestion = question.toLowerCase();
  const preferImprovedAnswer = shouldPreferImprovedAnswer(question);

  if (/^(fees?|fee setup|permit fees?)\??$/.test(loweredQuestion.trim()) || /how do i set up fees\??$/.test(loweredQuestion.trim())) {
    return {
      text: buildClarifyingQuestion(
        "I can narrow that down",
        "Do you want the administrator steps for creating the fee itself, building the fee template, or attaching the fee template to a permit type/work class?",
        [
          "Create the fee record in Fee Setup",
          "Build or edit the fee template",
          "Attach the fee template to the permit work class",
          "Give me the full end-to-end fee setup process",
        ]
      ),
      sources: [],
    };
  }

  if (/^(permits?|permit setup)\??$/.test(loweredQuestion.trim())) {
    return {
      text: buildClarifyingQuestion(
        "I can narrow that down",
        "Permit setup is broad in EPL. Which part do you want?",
        [
          "Set up permit types and work classes",
          "Set up permit workflow",
          "Set up permit fees",
          "Set up permit contact types",
        ]
      ),
      sources: [],
    };
  }

  if (/^(contacts?|contact setup)\??$/.test(loweredQuestion.trim())) {
    return {
      text: buildClarifyingQuestion(
        "I can narrow that down",
        "Contact setup can mean different things. Which part do you want?",
        [
          "Set up land management contact types",
          "Set up certification or license validation",
          "Associate contact types to a permit work class",
          "Give me the full contact setup process",
        ]
      ),
      sources: [],
    };
  }

  if (/reassign a review|assign a review to a different reviewer|reassign review/i.test(question)) {
    return {
      text: buildReassignReviewAnswer(),
      sources: [],
    };
  }

  if (/create (a )?permit type|set up (a )?permit type|setup permit type|permit type setup|permit type and work class|set up permit work class|create permit work class/i.test(question)) {
    return {
      text: buildPermitTypeSetupAnswer(),
      sources: [],
    };
  }

  const clarification = genericClarification(question, { wasDownvoted: preferImprovedAnswer });
  if (clarification && (!preferImprovedAnswer || isTrulyAmbiguousQuestion(question))) {
    return {
      text: clarification,
      sources: [],
    };
  }

  if (/how do i set up contact types|set up contact types|contact types setup|land management contact types/i.test(question)) {
    return {
      text: buildContactSetupAnswer(),
      sources: [],
    };
  }

  if (/create (a )?fee|create fees|set up fees|how do i set up fees|set up a fee|how do i create a fee|fee setup|fees setup|fee template/i.test(question)) {
    if (!hasGuideFamily("fee")) {
      return {
        text: buildMissingGuideAnswer("fee setup", "Fee Setup Guide or Cashier Setup Guide"),
        sources: [],
      };
    }
    return {
      text: buildFeeSetupAnswer(),
      sources: [],
    };
  }

  if (
    !state.vendor &&
    /e-?review|ereview|markup|studio session|digeplan project|resubmittal/i.test(question) &&
    !/bluebeam|digeplan/i.test(question)
  ) {
    return {
      text: "Are you using Bluebeam or DigEplan for this eReview workflow? The markup, file, and reviewer steps change based on that choice.",
      sources: [],
    };
  }

  if (!state.role && /how do i set up a review|how do i do a review|how do i work review coordinator/i.test(question)) {
    return {
      text: "Do you want the administrator setup steps, the coordinator workflow, or the reviewer steps? Those are different in EPL, and I can give you the right procedure once I know which one you mean.",
      sources: [],
    };
  }

  if (state.vendor === "digeplan" && /sso|single sign on|okta|corpdev|identity/i.test(question)) {
    return {
      text: buildDigeplanSsoAnswer(),
      sources: [],
    };
  }

  if (
    state.vendor === "digeplan" &&
    /set up|setup|onboarding|configure|configuration|pat token|tenant|connector|implementation/i.test(question)
  ) {
    return {
      text: buildDigeplanSetupAnswer(),
      sources: [],
    };
  }

  if (
    state.vendor === "bluebeam" &&
    /set up ereviews|setup ereviews|set up e-?reviews|e-?review setup|bluebeam setup|studio prime|configure bluebeam|bluebeam integration|developer network|implementation/i.test(question)
  ) {
    return {
      text: buildBluebeamSetupAnswer(),
      sources: [],
    };
  }

  if (state.vendor === "digeplan" && /reviewer|perform review|markups|markup|resubmittal|corrections|recommendations/i.test(question)) {
    return {
      text: buildDigeplanReviewerAnswer(),
      sources: [],
    };
  }

  if (state.vendor === "digeplan" && /review coordinator|coordinator|new files task|failed submittal|approved submittal/i.test(question)) {
    return {
      text: buildDigeplanCoordinatorAnswer(),
      sources: [],
    };
  }

  if (/how do i set up a review|how do we set up a review|set up review|setup review|configure review|review setup/i.test(question)) {
    return {
      text: buildGeneralEplSetupAnswer(),
      sources: [],
    };
  }

  if (/corrections and recommendations|add corrections and recommendations|how do reviewers add corrections and recommendations/i.test(question)) {
    return {
      text: buildCorrectionsRecommendationsAnswer(),
      sources: [],
    };
  }

  if (/work a review new files task|how do i work a review new files task|review new files task/i.test(question)) {
    return {
      text: buildReviewNewFilesTaskAnswer(),
      sources: [],
    };
  }

  if (/how do i do a review|how do i complete a review|perform a review|reviewer steps|how do reviewers|complete review/i.test(question)) {
    return {
      text: buildGeneralReviewerWorkflowAnswer(),
      sources: [],
    };
  }

  if (/manage a review|manage my reviews|how do i manage a review|how do i manage reviews|manage review/i.test(question)) {
    return {
      text: buildManageReviewAnswer(),
      sources: [],
    };
  }

  if (/quick review|complete a quick review|update review status quickly|quick update/i.test(question)) {
    return {
      text: buildQuickReviewAnswer(),
      sources: [],
    };
  }

  if (/open the full review|launch the review|open review/i.test(question)) {
    return {
      text: buildOpenFullReviewAnswer(),
      sources: [],
    };
  }

  const ranked = state.kb.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens, question) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (!ranked.length) {
    return {
      text: preferImprovedAnswer
        ? "I still could not find a strong enough guide match to safely improve that answer. Try asking with one concrete noun and action, such as `set up contact types`, `create a fee`, `reassign a review`, or `configure Review Coordinator`."
        : "I couldn’t find a strong guide match for that yet. Try asking about setup, Review Coordinator, Manage My Reviews, dashboards, teams, permits, licenses, corrections, recommendations, or resubmittals.",
      sources: [],
    };
  }

  const vendorSpecific = ranked.find((item) => item.chunk.vendor === state.vendor);
  const general = ranked.find((item) => item.chunk.vendor === "general");
  const chosen = [vendorSpecific, general, ...ranked]
    .filter(Boolean)
    .map((item) => item.chunk)
    .filter((chunk, index, all) => all.findIndex((entry) => entry.id === chunk.id) === index)
    .slice(0, 6);

  return {
    text: buildProceduralGuideAnswer(question, chosen),
    sources: [],
  };
}

async function loadKnowledgeBase() {
  const loadingOverlay = document.getElementById("loading-overlay");
  try {
    if (window.EREVIEWS_KNOWLEDGE_BASE) {
      state.kb = window.EREVIEWS_KNOWLEDGE_BASE;
    } else {
      const response = await fetch("./data/knowledge-base.json");
      state.kb = await response.json();
    }
    renderSuggestions();
    addBotMessage(
      "Ask about EPL setup, user workflows, coordinator tasks, dashboards, permits, licenses, or review steps. If your question is about eReviews and you do not mention Bluebeam or DigEplan, I’ll ask which one you use."
    );
  } finally {
    if (loadingOverlay) {
      loadingOverlay.classList.add("hidden");
      setTimeout(() => {
        loadingOverlay.style.display = "none";
      }, 300);
    }
  }
}

function initializeDarkMode() {
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  const savedMode = localStorage.getItem("darkMode");

  if (savedMode === "enabled") {
    document.body.classList.add("dark-mode");
  }

  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      const isDark = document.body.classList.contains("dark-mode");
      localStorage.setItem("darkMode", isDark ? "enabled" : "disabled");
    });
  }
}

function initializeKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    // Ctrl+K or Cmd+K to focus input
    if ((event.ctrlKey || event.metaKey) && event.key === "k") {
      event.preventDefault();
      questionInput.focus();
      questionInput.select();
    }

    // Escape to clear input
    if (event.key === "Escape" && document.activeElement === questionInput) {
      questionInput.value = "";
      questionInput.blur();
    }
  });
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) {
    return;
  }

  trackQuestionUsage(question);
  renderSuggestions();
  addUserMessage(question);

  const requestedVendor = detectVendorSwitch(question);
  if (requestedVendor && requestedVendor !== state.vendor) {
    setVendor(requestedVendor);
  }
  const requestedRole = detectRoleSwitch(question);
  if (requestedRole && requestedRole !== state.role) {
    setRole(requestedRole);
  }

  const answer = answerQuestion(question);
  addBotMessage(answer.text, answer.sources);
  questionInput.value = "";
});

initializeDarkMode();
initializeKeyboardShortcuts();

loadKnowledgeBase().catch((error) => {
  console.error(error);
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 300);
  }
  addBotMessage(
    "I couldn’t load the guide knowledge base. Rebuild `data/knowledge-base.json` from the PDFs and refresh the page."
  );
});
