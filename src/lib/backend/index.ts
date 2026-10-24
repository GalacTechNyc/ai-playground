/** Selects mock or durable backend without changing the v0 API routes. */
import * as mock from "../store";
import * as live from "./supabase";
import type {AgentPassport,ActRequest,ExamActionResult} from "@contracts/types";
export const isMock = !["supabase","supabase-edge"].includes(process.env.BACKEND ?? "");
export const agentFromToken = (auth:string|null) => isMock ? Promise.resolve(mock.agentFromToken(auth)) : live.agentFromToken(auth);
export const registerAgent = (input:Partial<AgentPassport>,ownerId:string) =>
 isMock ? Promise.resolve(mock.registerAgent(input)) : live.registerAgent(input,ownerId);
export const listAgents = () => isMock ? Promise.resolve([...mock.db().agents.values()]) : live.listAgents();
export const getAgent = (id:string) => isMock ? Promise.resolve(mock.db().agents.get(id)||null) : live.getAgent(id);
export const act = (agent:AgentPassport,req:ActRequest) => isMock ? Promise.resolve(mock.act(agent,req)) : live.act(agent,req);
export const eventsFor = (agent:AgentPassport,cursor:number,limit:number) =>
 isMock ? Promise.resolve(mock.eventsFor(agent,cursor,limit)) : live.eventsFor(agent,cursor,limit);
export const tickSimulation = () => { if (isMock) mock.tickSimulation(); };
export const listRooms = () => isMock ? Promise.resolve(mock.listRooms()) : live.listRooms();
export const roomMessages = (id:string,after?:string) => isMock ? Promise.resolve(mock.roomMessages(id,after)) : live.roomMessages(id,after);
export const publicFeed = (limit=40) => isMock ? Promise.resolve(mock.publicFeed(limit)) : live.publicFeed(limit);
export const ownerFromRequest = (req:Request) => isMock ? Promise.resolve("demo-owner") : live.ownerFromRequest(req);
export const resolveApproval = (id:string,owner:string,decision:"approve"|"reject") =>
 isMock ? Promise.resolve(mock.resolveApproval(id,decision)) : live.resolveApproval(id,owner,decision);
export const listApprovals = (owner:string) => isMock ? Promise.resolve(mock.listApprovals()) : live.listApprovals(owner);

// ---- v0.2 Open World ----
import * as mw from "../mockWorld";
const nm = (id: string) => mock.db().agents.get(id)?.name ?? "?";
export const worldState = () => isMock ? Promise.resolve(mw.mockWorldState(nm)) : live.worldState();
/** Public server-verified catches only; local human F-key catches are not included. */
export const lakeFishingBoard = () => isMock ? Promise.resolve({ leaderboard: [], recentCatches: [] }) : live.lakeFishingBoard();
/** The token determines the server-trusted listening position. */
export async function worldNearbyFor(agent: AgentPassport) {
  if (!isMock) return live.worldNearbyFor(agent);
  const world = mw.mockWorldState(nm);
  const me = world.agents.find((a) => a.agentId === agent.id);
  if (!me) return { httpStatus: 200, agentId: agent.id, radius: 12, messages: [] };
  return {
    httpStatus: 200, agentId: agent.id, radius: 12,
    messages: world.agents
      .filter((a) => a.say && a.sayAt && Math.hypot(a.x - me.x, a.z - me.z) <= 12)
      .map((a) => ({
        agentId: a.agentId, agentName: a.name, text: a.say as string,
        at: a.sayAt as string, distance: Math.round(Math.hypot(a.x - me.x, a.z - me.z) * 10) / 10,
      })),
  };
}

export const arcadeGames = () => isMock ? Promise.resolve(mw.mockGames()) : live.arcadeGames();
export const arcadeGame = (id: string) => isMock ? Promise.resolve(mw.mockGame(id)) : live.arcadeGame(id);
export const leaderboard = () => isMock ? Promise.resolve(mw.mockLeaderboard(nm)) : live.leaderboard();
export const blockHistory = (x: number, y: number, z: number) => isMock ? Promise.resolve(mw.mockBlockHistory()) : live.blockHistory(x, y, z);
export const ownerAct = (owner: string, agentId: string, req: ActRequest) => {
  if (!isMock) return live.ownerAct(owner, agentId, req);
  const a = mock.db().agents.get(agentId);
  return Promise.resolve(a ? mock.act(a, req) : { status: 404, body: { error: { code: "AGENT_NOT_FOUND", message: "Unknown agent", retryable: false } } });
};
export const ownerAgents = (owner: string) => isMock ? Promise.resolve([...mock.db().agents.values()].map((a) => ({ ...a, autopilot: false }))) : live.ownerAgents(owner);
export const setAutopilot = (owner: string, id: string, on: boolean) => isMock
  ? Promise.resolve({ status: 501, body: { error: { code: "MOCK_UNSUPPORTED", message: "Autopilot needs the Supabase backend", retryable: false } } })
  : live.setAutopilot(owner, id, on);

// ---- v3 Dream World (Supabase only; mock returns empty) ----
export const memoryNotes = (limit?: number, tag?: string) => isMock ? Promise.resolve([]) : live.memoryNotes(limit, tag);
export const settleDueTeamQuests = () => isMock ? Promise.resolve(0) : live.settleDueTeamQuests();
export const quests = () => isMock ? Promise.resolve([]) : live.quests();
export const reputation = () => isMock ? Promise.resolve([]) : live.reputation();
export const presence = () => isMock ? Promise.resolve([]) : live.presence();
export const timeline = (limit?: number) => isMock ? Promise.resolve([]) : live.timeline(limit);
export const dmsFor = (agent: AgentPassport, limit?: number) => isMock ? Promise.resolve({ messages: [], unread: 0, notebook: null }) : live.dmsFor(agent, limit);

// Public co-op metadata; no private puzzle fragments are readable without a validated token.
export const coopPuzzles = () => isMock ? Promise.resolve([]) : live.coopPuzzles();
export const coopCluesFor = (agent: AgentPassport) => isMock ? Promise.resolve({ httpStatus: 200, clues: [] }) : live.coopCluesFor(agent);

/** No public answer material is returned before the challenge deadline. */
export const exams = () => isMock ? Promise.resolve([]) : live.exams();
export const createExam = (owner: string, title: string, prompt: string, answer: string, minutes: number): Promise<ExamActionResult> =>
  isMock ? Promise.resolve({ httpStatus: 501, error: "MOCK_UNSUPPORTED" }) :
  live.createExam(owner, title, prompt, answer, minutes);
export const submitExam = (agent: AgentPassport, examId: string, answer: string): Promise<ExamActionResult> =>
  isMock ? Promise.resolve({ httpStatus: 501, error: "MOCK_UNSUPPORTED" }) :
  live.submitExam(agent, examId, answer);
