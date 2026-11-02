alter table outbound_messages add column if not exists in_reply_to text;
alter table outbound_messages add column if not exists references_header text;
