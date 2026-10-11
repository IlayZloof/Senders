#!/bin/bash
# Offline test for 022_admin_delete_user_live.sql. Never run against the live project.
# Usage: PGPORT=55433 ./run_tests.sh   (needs a local Postgres 17 superuser "postgres", socket in /tmp)
set -u
cd "$(dirname "$0")"
PORT=${PGPORT:-55433}
ADM="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -At"
$ADM -d postgres -c "drop database if exists t022" -c "create database t022" >/dev/null
P="$ADM -d t022"
S=../020_enforce_user_approval
$P -f $S/00_stub.sql -f $S/01_live.sql -f $S/02_live_funcs.sql >/dev/null
$P -f ../../migrations/020_enforce_user_approval.sql >/dev/null 2>&1 || { echo "020 failed"; exit 1; }
$P -f 03_extra.sql >/dev/null
# apply twice: must be idempotent
$P -f ../../migrations/022_admin_delete_user_live.sql >/dev/null && $P -f ../../migrations/022_admin_delete_user_live.sql >/dev/null || { echo "022 failed"; exit 1; }

A=00000000-0000-0000-0000-00000000000a   # ilay (admin, from 01_live seed)
E=00000000-0000-0000-0000-00000000000e   # old@x.com (active user)
T=00000000-0000-0000-0000-0000000000f1  # target
B=00000000-0000-0000-0000-0000000000b2   # second admin
pass=0; fail=0
as() { echo "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', false);"; }
t() { out=$($P -c "$3" 2>&1); rc=$?
  if { [ "$2" = ok ] && [ $rc -eq 0 ]; } || { [ "$2" = fail ] && [ $rc -ne 0 ]; }; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 (rc=$rc) $out"; fail=$((fail+1)); fi
  [ "$2" = fail ] && echo "      -> $(echo "$out" | grep -m1 ERROR)"; }
q() { $P -c "$1" | tail -1; }
eq() { v=$(q "$2"); if [ "$v" = "$3" ]; then echo "PASS  $1 = $v"; pass=$((pass+1)); else echo "FAIL  $1 = $v (expected $3)"; fail=$((fail+1)); fi; }

# fixtures: target user with rows everywhere
$P <<SQL >/dev/null
update profiles set status='active' where id in ('$E');
insert into auth.users(id,email) values ('$T','target@x.com'), ('$B','admin2@x.com');
update profiles set status='active' where id='$T';
insert into spots(id,name,status,created_by) values ('sp-t','target spot','approved','$T'), ('sp-e','other spot','approved','$E');
insert into jump_videos(id,user_id,spot_id,video_url) values ('v-t','$T','sp-t','u1'), ('v-e','$E','sp-e','u2');
insert into jump_video_comments(id,video_id,user_id,text) values ('c1','v-t','$E','on target reel'), ('c2','v-e','$T','target on other reel'), ('c3','v-e','$E','keep');
insert into jump_video_likes(video_id,user_id) values ('v-t','$E'), ('v-e','$T'), ('v-e','$E');
insert into jump_video_saves(user_id,video_id) values ('$E','v-t'), ('$T','v-e'), ('$E','v-e');
insert into experiences(id,spot_id,user_id,text) values ('x1','sp-e','$T','x');
insert into jumps(id,spot_id,user_id,height) values ('j1','sp-e','$T',5);
insert into admin_notifications(id,type,title,user_id) values ('n1','new_spot','t','$T');
insert into invitations(email,invited_by) values ('friend@x.com','$T');
insert into audit_log(admin_user_id,action,target_user_id,details) values ('$A','USER_REACTIVATED','$T','x');
insert into storage.objects(bucket_id,name,owner) values ('jump-videos','$T/a.mp4','$T');
insert into mystery_refs(who) values ('$T'); insert into mystery_soft(who) values ('$T');
SQL

eq "function owner" "select pg_get_userbyid(proowner)||','||prosecdef from pg_proc where proname='admin_delete_user'" "postgres,true"
eq "anon has no execute" "select has_function_privilege('anon','public.admin_delete_user(uuid)','execute')" "f"
t "anon cannot call" fail "set role anon; select admin_delete_user('$T');"
t "non-admin (active user) refused" fail "$(as $E) select admin_delete_user('$T');"
t "admin cannot delete self" fail "$(as $A) select admin_delete_user('$A');"
t "unknown user refused" fail "$(as $A) select admin_delete_user(gen_random_uuid());"
t "null target refused" fail "$(as $A) select admin_delete_user(null);"
eq "target still there after refusals" "select count(*) from profiles where id='$T'" "1"

t "admin deletes target" ok "$(as $A) select admin_delete_user('$T');"
eq "auth.users row gone" "select count(*) from auth.users where id='$T'" "0"
eq "profile gone" "select count(*) from profiles where id='$T'" "0"
eq "target reel gone" "select count(*) from jump_videos where id='v-t'" "0"
eq "other reel kept" "select count(*) from jump_videos where id='v-e'" "1"
eq "comments left (only c3)" "select string_agg(id,',') from jump_video_comments" "c3"
eq "likes left" "select count(*) from jump_video_likes" "1"
eq "saves left" "select count(*) from jump_video_saves" "1"
eq "experiences/jumps removed" "select (select count(*) from experiences where user_id='$T')+(select count(*) from jumps where user_id='$T')" "0"
eq "spot kept, unlinked" "select coalesce(created_by::text,'null')||','||status from spots where id='sp-t'" "null,approved"
eq "notification kept, unlinked" "select coalesce(user_id::text,'null') from admin_notifications where id='n1'" "null"
eq "invitation kept, unlinked" "select coalesce(invited_by::text,'null') from invitations where email='friend@x.com'" "null"
eq "audit USER_DELETED row" "select admin_user_id||','||action||','||(details like 'target@x.com (%') from audit_log where action='USER_DELETED'" "$A,USER_DELETED,true"
eq "old audit row unlinked" "select coalesce(target_user_id::text,'null') from audit_log where action='USER_REACTIVATED'" "null"
eq "storage file kept, owner unlinked" "select count(*)||','||coalesce(max(owner::text),'null') from storage.objects where name like '$T/%'" "1,null"
eq "safety net: NOT NULL FK row deleted" "select count(*) from mystery_refs" "0"
eq "safety net: nullable FK nulled" "select count(*)||','||count(who) from mystery_soft" "1,0"
t "deleting again -> not found" fail "$(as $A) select admin_delete_user('$T');"

# admins: second admin can be deleted while another active admin remains
$P -c "update profiles set is_admin=true, status='active' where id='$B';" >/dev/null
t "admin deletes another admin (one remains)" ok "$(as $A) select admin_delete_user('$B');"
# disabled admin cannot act
$P -c "insert into auth.users(id,email) values ('$B','admin2@x.com'); update profiles set is_admin=true, status='active' where id='$B';" >/dev/null
$P -c "update profiles set status='disabled' where id='$B';" >/dev/null
t "disabled admin refused" fail "$(as $B) select admin_delete_user('$E');"
# last-admin guard: only reachable if is_active_admin() and the profile check disagree;
# simulate by making the caller look active-admin via a stubbed is_active_admin().
$P -c "update profiles set is_admin=false where id='$B'; delete from profiles where id='$B'; delete from auth.users where id='$B';" >/dev/null
$P -c "create or replace function public.is_active_admin() returns boolean language sql stable as 'select true';" >/dev/null
t "last active admin cannot be deleted" fail "$(as $E) select admin_delete_user('$A');"
eq "admin still there" "select count(*) from profiles where id='$A' and is_admin" "1"

echo "TOTAL pass=$pass fail=$fail"
[ $fail -eq 0 ]
