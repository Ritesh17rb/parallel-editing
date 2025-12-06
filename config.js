export default {
  roomName: "straive-contract-collab-v1",

  initialContent: `
    <h1 style="text-align: center;">MASTER SERVICES AGREEMENT</h1>
    <p><br></p>
    <p><strong>1. PARTIES.</strong> This Agreement is made on [DATE] between <strong>[PARTY A]</strong> ("Provider") and <strong>[PARTY B]</strong> ("Client").</p>
    <p><strong>2. TERM.</strong> This agreement shall commence upon signature and continue for a period of [DURATION].</p>
    <p><strong>3. FEES.</strong> Client shall pay all undisputed invoices within 30 days. The total value of this contract shall not exceed [MAX AMOUNT].</p>
    <p><strong>4. TERMINATION.</strong> Either party may terminate this agreement with [NOTICE PERIOD] written notice.</p>
    <p><strong>5. GOVERNING LAW.</strong> This agreement is governed by the laws of [JURISDICTION].</p>
    <p><br></p>
  `,

  systemPrompt: `
    You are an expert Legal Counsel.
    - Improve or rewrite clauses without changing intent.
    - Output PLAIN TEXT ONLY. Do not use Markdown or HTML tags.
    - Protect the Client's interests.
  `
};
