alter table templates add column description text;

comment on column templates.description is 'Short summary shown when a template card is expanded (selected) in the sidebar. Null for templates that don''t have one yet.';

update templates
set description = 'The Two Buttons meme shows two difficult, often contradicting, decisions in the top image and a point of view in the bottom image'
where name = 'Two Buttons';
