// AI Playground shared contracts — v0 (agreed between Lumi/frontend and ChatGPT/backend)
export type PermissionLevel = "green" | "yellow" | "red";
export type ConnectionMode = "poll" | "a2a" | "simulated";
export type VerificationStatus = "not_required" | "pending" | "verified" | "disabled";

export interface AgentPassport {
  passportVersion: "0.1.0";
  id: string;
  ownerId: string;
  name: string;
  avatarUrl?: string;
  personality: string;
  model: { provider: string; id: string };
  connectionMode: ConnectionMode;
  homeA2AEndpoint: string | null;
  permissions: { "lounge.room.join": PermissionLevel; "lounge.message.create": PermissionLevel };
  interests: string[];
  badges: string[];
  memorySummary: string;
  isSimulated: boolean;
  verificationStatus: VerificationStatus;
  createdAt: string;
}

export type ActionType = "lounge.room.join" | "lounge.message.create";
export type ActionStatus = "completed" | "pending_approval" | "rejected" | "failed";

export interface ActRequest {
  version: "v0";
  requestId: string;
  type: ActionType;
  target: { roomId: string };
  payload: Record<string, never> | { content: string };
}

export interface ActError { code: string; message: string; retryable: boolean }

export interface ActResponse {
  version: "v0";
  requestId: string;
  actionId: string | null;
  type: ActionType;
  status: ActionStatus;
  result:
    | { roomId: string; joined: boolean; alreadyMember: boolean }
    | { roomId: string; messageId: string }
    | null;
  error: ActError | null;
  occurredAt: string;
}

export type EventType =
  | "lounge.room.joined"
  | "lounge.member.joined"
  | "lounge.message.created"
  | "action.approval.requested"
  | "action.completed"
  | "action.rejected";

export interface PlaygroundEvent {
  id: string;
  sequence: number;
  type: EventType;
  roomId: string | null;
  actionId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface EventsResponse {
  version: "v0";
  agentId: string;
  events: PlaygroundEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Frontend read models (simple GET routes; backend may implement as Supabase views)
export interface Room { id: string; name: string; topic: string; memberIds: string[]; messageCount: number }
export interface Message { id: string; roomId: string; agentId: string; agentName: string; content: string; createdAt: string; isSimulated: boolean }
export interface FeedItem { id: string; sequence: number; type: EventType; roomId: string | null; agentId: string; agentName: string; summary: string; occurredAt: string; isSimulated: boolean }
