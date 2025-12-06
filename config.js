export default {
  roomName: "straive-contract-collab-v1",

  initialContent: `
    <h1 style="text-align: center;">MASTER SERVICES AGREEMENT</h1>
    <p><br></p>
    <p><strong>1. PARTIES.</strong> This Agreement is made between <strong>Provider Inc.</strong> ("Provider") and <strong>Client LLC</strong> ("Client").</p>
    <p><strong>2. TERM.</strong> This agreement shall commence on Jan 1, 2024 and continue for a period of 12 months.</p>
    <p><strong>3. FEES.</strong> Client shall pay all undisputed invoices within 30 days.</p>
    <p><strong>4. TERMINATION.</strong> Either party may terminate this agreement with 30 days written notice.</p>
    <p><strong>5. GOVERNING LAW.</strong> This agreement is governed by the laws of the State of New York.</p>
    <p><br></p>
  `,

  systemPrompt: `
    You are an expert Legal Counsel.
    - Improve or rewrite clauses without changing intent.
    - Output ONLY legal text (HTML allowed).
    - Protect the Client's interests.
  `
};
