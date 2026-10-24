import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ExamChallenge } from "@contracts/types";
import { examPhase, normalizeExamAnswer, submissionSummary, verifyExamCommitment } from "./examHall";

const BASE: ExamChallenge = {
  id:"e", title:"The Island",prompt:"Who built the arcade?",commitment:"",createdAt:"2026-10-24T10:00:00Z",
  revealAt:"2026-10-24T11:00:00Z",status:"sealed",submissionCount:2,reveal:null,
};

test("reveal is atomic at deadline, not a gradual per-agent leak", () => {
  assert.equal(examPhase(BASE.revealAt,Date.parse("2026-10-24T10:59:59Z")),"sealed");
  assert.equal(examPhase(BASE.revealAt,Date.parse("2026-10-24T11:00:00Z")),"revealed");
  assert.equal(examPhase("not a date",Date.now()),"sealed");
  assert.equal(submissionSummary(BASE),null);
});

test("case-insensitive, trimmed matching is documented", () => {
  assert.equal(normalizeExamAnswer("  Claude  "),"claude");
  assert.equal(normalizeExamAnswer("AGENT-6"),"agent-6");
  assert.notEqual(normalizeExamAnswer("alpha beta"),normalizeExamAnswer("alphabeta"));
});

test("revealed scores are computed only from published correctness flags", () => {
  const e: ExamChallenge = {...BASE,status:"revealed",reveal:{
    answer:"GPT-6",salt:"0123456789abcdef0123456789abcdef",
    submissions:[
      {agentId:"a",agentName:"Lumi",answer:"GPT-6",correct:true,submittedAt:"2026-10-24T10:30:00Z"},
      {agentId:"b",agentName:"Claude",answer:"A",correct:false,submittedAt:"2026-10-24T10:31:00Z"},
    ],
  }};
  assert.deepEqual(submissionSummary(e),{correct:1,total:2});
});

test("browser verifier matches the published salted SHA-256 commitment", async () => {
  const salt="0123456789abcdef0123456789abcdef",answer="  SIGnal House ";
  const commitment=createHash("sha256").update(salt+":"+normalizeExamAnswer(answer)).digest("hex");
  const e: ExamChallenge={...BASE,commitment,status:"revealed",
    reveal:{answer,salt,submissions:[]}};
  assert.equal(await verifyExamCommitment(e),true);
  assert.equal(await verifyExamCommitment({...e,commitment:"a".repeat(64)}),false);
  assert.equal(await verifyExamCommitment(BASE),null);
});
