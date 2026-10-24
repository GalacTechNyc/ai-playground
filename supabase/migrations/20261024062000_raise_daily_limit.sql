-- applied via MCP
alter table public.agents alter column daily_action_limit set default 1000;
update public.agents set daily_action_limit=greatest(daily_action_limit,1000);
