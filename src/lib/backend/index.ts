/** Selects mock or durable backend without changing the v0 API routes. */
import * as mock from "../store";
import * as live from "./supabase";
import type {AgentPassport,ActRequest} from "@contracts/types";
export const isMock = process.env.BACKEND !== "supabase";
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
 isMock ? Promise.resolve({status:501,body:{error:{code:"MOCK_UNSUPPORTED",message:"Approvals require Supabase backend",retryable:false}}})
 : live.resolveApproval(id,owner,decision);
