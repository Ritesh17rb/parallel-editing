export const templates = {
  "MSA": `
    <h1 style="text-align: center;">MASTER SERVICES AGREEMENT</h1>
    <p><br></p>
    <p><strong>1. PARTIES.</strong> This Agreement is made on [DATE] between <strong>[PARTY A]</strong> ("Provider") and <strong>[PARTY B]</strong> ("Client").</p>
    <p><strong>2. TERM.</strong> This agreement shall commence upon signature and continue for a period of [DURATION].</p>
    <p><strong>3. FEES.</strong> Client shall pay all undisputed invoices within 30 days. The total value of this contract shall not exceed [MAX AMOUNT].</p>
    <p><strong>4. TERMINATION.</strong> Either party may terminate this agreement with [NOTICE PERIOD] written notice.</p>
    <p><strong>5. GOVERNING LAW.</strong> This agreement is governed by the laws of [JURISDICTION].</p>
    <p><br></p>
  `,
  "NDA": `
    <h1 style="text-align: center;">NON-DISCLOSURE AGREEMENT</h1>
    <p><br></p>
    <p><strong>1. DEFINITION.</strong> "Confidential Information" means all non-public information disclosed by one party to the other.</p>
    <p><strong>2. OBLIGATIONS.</strong> The Recipient agrees to (a) hold Confidential Information in strict confidence, and (b) Limit access to those who need to know.</p>
    <p><strong>3. EXCLUSIONS.</strong> Information is not confidential if it is (i) Publicly known, (ii) Already known to Recipient, or (iii) Independently developed.</p>
    <p><strong>4. TERM.</strong> This agreement remains in effect for [YEARS] years.</p>
    <p><br></p>
  `,
  "EMPLOYMENT": `
    <h1 style="text-align: center;">EMPLOYMENT CONTRACT</h1>
    <p><br></p>
    <p><strong>1. POSITION.</strong> The Employee is employed in the position of [JOB TITLE].</p>
    <p><strong>2. SALARY.</strong> The Company shall pay the Employee a salary of [AMOUNT] per year.</p>
    <p><strong>3. HOURS.</strong> Standard hours of work are [HOURS] per week, Monday to Friday.</p>
    <p><strong>4. PROBATION.</strong> The first [MONTHS] months of employment shall be a probationary period.</p>
    <p><br></p>
  `
};

export default {
  roomName: "contract-collab-v1",

  initialContent: templates["MSA"],

  systemPrompt: `
    You are an expert Legal Counsel.
    - Improve or rewrite clauses without changing intent.
    - Output PLAIN TEXT ONLY. Do not use Markdown or HTML tags.
    - Protect the Client's interests.
  `
};
