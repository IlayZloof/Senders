#!/bin/bash
P="psql -h /tmp -p 55432 -U postgres -d t -v ON_ERROR_STOP=1 -q -At"
A=00000000-0000-0000-0000-00000000000a; E=00000000-0000-0000-0000-00000000000e
pass=0; fail=0
as() { # uid email
  echo "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"email\":\"$2\",\"role\":\"authenticated\"}', false);"
}
t() { # name expect(ok|fail) sql
  out=$($P -c "$3" 2>&1); rc=$?
  if { [ "$2" = ok ] && [ $rc -eq 0 ]; } || { [ "$2" = fail ] && [ $rc -ne 0 ]; }; then
    echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 (rc=$rc) $out"; fail=$((fail+1)); fi
  [ "$2" = fail ] && echo "      -> $(echo "$out" | grep -m1 ERROR)"
}
q() { $P -c "$1" | tail -1; }

# new signup via auth (GoTrue path, runs as supabase_auth_admin in prod; here postgres)
$P -c "insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','new1@x.com')"
N1=00000000-0000-0000-0000-000000000001
echo "new signup profile: $(q "select status||','||is_admin from profiles where id='$N1'")  (expect disabled,f)"
echo "default col: $(q "select column_default from information_schema.columns where table_name='profiles' and column_name='status'")"

# 1) self-promote / self-approve
t "non-admin self-promote to admin" fail "$(as $N1 new1@x.com) update profiles set is_admin=true where id='$N1';"
t "non-admin self-approve (status=active)" fail "$(as $N1 new1@x.com) update profiles set status='active' where id='$N1';"
t "active non-admin self-promote" fail "$(as $E old@x.com) update profiles set is_admin=true where id='$E';"
t "non-admin email spoof to admin email" fail "$(as $N1 new1@x.com) update profiles set email='ilay.zloof@gmail.com' where id='$N1';"
t "non-admin can edit display_name/bio/avatar" ok "$(as $N1 new1@x.com) update profiles set display_name='n', bio='b', avatar_url='u' where id='$N1';"
t "non-admin can touch last_login_at" ok "$(as $N1 new1@x.com) update profiles set last_login_at=now() where id='$N1';"
t "client signup upsert (same values) still ok" ok "$(as $N1 new1@x.com) insert into profiles(id,display_name,email,is_admin,status) values ('$N1','n','new1@x.com',false,'disabled') on conflict (id) do update set display_name=excluded.display_name, email=excluded.email, is_admin=excluded.is_admin, status=excluded.status;"
t "client upsert trying status=active (no-op: BEFORE INSERT trigger rewrites excluded.*)" ok "$(as $N1 new1@x.com) insert into profiles(id,display_name,email,is_admin,status) values ('$N1','n','new1@x.com',true,'active') on conflict (id) do update set is_admin=excluded.is_admin, status=excluded.status;"
echo "      N1 after upsert attempt: $(q "select status||','||is_admin from profiles where id='$N1'") (expect disabled,false)"
t "non-admin cannot update someone else" ok "$(as $N1 new1@x.com) update profiles set display_name='hacked' where id='$E';"
echo "      other user's name now: $(q "select display_name from profiles where id='$E'") (expect old)"

# 2) client-side profile insert (user without profile) forced disabled
$P -c "alter table auth.users disable trigger on_auth_user_created; insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000002','new2@x.com'); alter table auth.users enable trigger on_auth_user_created;"
N2=00000000-0000-0000-0000-000000000002
t "non-admin client insert with is_admin=true,status=active" ok "$(as $N2 new2@x.com) insert into profiles(id,display_name,email,is_admin,status) values ('$N2','x','ilay.zloof@gmail.com',true,'active');"
echo "      stored: $(q "select status||','||is_admin||','||email from profiles where id='$N2'")  (expect disabled,f,new2@x.com)"
t "insert profile for another uid" fail "$(as $N2 new2@x.com) insert into profiles(id,display_name) values (gen_random_uuid(),'x');"

# 3) disabled user cannot write content
t "disabled user insert spot" fail "$(as $N1 new1@x.com) insert into spots(id,name) values ('s1','x');"
t "disabled user insert experience" fail "$(as $N1 new1@x.com) insert into experiences(id,user_id,text) values ('e1','$N1','x');"
t "disabled user insert jump_video" fail "$(as $N1 new1@x.com) insert into jump_videos(id,user_id,spot_id,video_url) values ('v-disabled','$N1','s','u');"
t "disabled user publish_jump_video rpc" fail "$(as $N1 new1@x.com) select publish_jump_video('vid-disabled-1','s','n','c','u');"
t "disabled user upload storage object" fail "$(as $N1 new1@x.com) insert into storage.objects(bucket_id,name) values ('jump-videos','$N1/a.mp4');"
t "disabled user insert notification" fail "$(as $N1 new1@x.com) insert into admin_notifications(id,type,title,user_id) values ('n1','report','t','$N1');"
t "disabled user insert save" fail "$(as $N1 new1@x.com) insert into jump_video_saves(user_id,video_id) values ('$N1','v0');"
t "disabled user can still read" ok "$(as $N1 new1@x.com) select count(*) from jump_videos;"

# existing active user still works
t "active user insert spot" ok "$(as $E old@x.com) insert into spots(id,name) values ('s2','x');"
t "active user publish_jump_video rpc" ok "$(as $E old@x.com) select publish_jump_video('vid-active-1','s','n','c','u');"
t "active user insert comment" ok "$(as $E old@x.com) insert into jump_video_comments(id,video_id,user_id,text) values ('c1','vid-active-1','$E','x');"
t "active user like" ok "$(as $E old@x.com) insert into jump_video_likes(video_id,user_id) values ('vid-active-1','$E');"
t "active user upload storage" ok "$(as $E old@x.com) insert into storage.objects(bucket_id,name) values ('jump-videos','$E/a.mp4');"
t "active user notification own name" ok "$(as $E old@x.com) insert into admin_notifications(id,type,title,user_id) values ('n2','report','t','$E');"
t "active user notification in another's name" fail "$(as $E old@x.com) insert into admin_notifications(id,type,title,user_id) values ('n3','report','t','$N1');"
t "active user update own video caption" ok "$(as $E old@x.com) update jump_videos set caption='z' where id='vid-active-1';"

# 4) admin approves
t "admin approves new user" ok "$(as $A ilay.zloof@gmail.com) update profiles set status='active' where id='$N1';"
echo "      N1 status: $(q "select status from profiles where id='$N1'") (expect active)"
t "approved user can now insert spot" ok "$(as $N1 new1@x.com) insert into spots(id,name) values ('s3','x');"
t "admin grants admin" ok "$(as $A ilay.zloof@gmail.com) update profiles set is_admin=true where id='$E';"
t "admin revokes admin" ok "$(as $A ilay.zloof@gmail.com) update profiles set is_admin=false where id='$E';"
t "admin disables user" ok "$(as $A ilay.zloof@gmail.com) update profiles set status='disabled' where id='$N1';"
t "admin cannot disable self (existing trigger)" fail "$(as $A ilay.zloof@gmail.com) update profiles set status='disabled' where id='$A';"
t "re-disabled user cannot insert" fail "$(as $N1 new1@x.com) insert into spots(id,name) values ('s4','x');"

# 5) trusted contexts
t "service_role can change status" ok "set role service_role; select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); update profiles set status='active' where id='$N2';"
t "postgres (SQL editor) can change is_admin" ok "update profiles set is_admin=false where id='$N2'; update profiles set status='disabled' where id='$N2';"
t "anon cannot write spot" fail "set role anon; insert into spots(id,name) values ('s5','x');"

echo "TOTAL pass=$pass fail=$fail"
