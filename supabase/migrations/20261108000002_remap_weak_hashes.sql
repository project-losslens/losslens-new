DO $migration$
DECLARE
    mapped_count BIGINT;
    remaining_count BIGINT;
BEGIN

    -- =========================================================
    -- 1. Create the temporary mapping table
    -- =========================================================

    CREATE TEMP TABLE weak_hash_map (
        old_hash TEXT PRIMARY KEY,
        new_hash TEXT NOT NULL UNIQUE
    ) ON COMMIT DROP;

    -- =========================================================
    -- 2. Collect all weak hashes from the affected tables
    -- =========================================================

    INSERT INTO weak_hash_map (old_hash, new_hash)
    SELECT
        h,
        encode(gen_random_bytes(16), 'hex')
    FROM (
        SELECT circle_user_hash AS h
        FROM public.profiles
        WHERE circle_user_hash IS NOT NULL

        UNION

        SELECT user_hash
        FROM public.circle_room_members
        WHERE user_hash IS NOT NULL

        UNION

        SELECT user_hash
        FROM public.circle_messages
        WHERE user_hash IS NOT NULL

        UNION

        SELECT user1_hash
        FROM public.whispers_matches
        WHERE user1_hash IS NOT NULL

        UNION

        SELECT user2_hash
        FROM public.whispers_matches
        WHERE user2_hash IS NOT NULL

        UNION

        SELECT sender_hash
        FROM public.whispers_messages
        WHERE sender_hash IS NOT NULL

        UNION

        SELECT reporter_hash
        FROM public.whispers_reports
        WHERE reporter_hash IS NOT NULL
    ) AS source_hashes
    WHERE LEFT(h, 5) = 'user_'
      AND LENGTH(h) <= 13
    GROUP BY h;

    SELECT COUNT(*)
    INTO mapped_count
    FROM weak_hash_map;

    RAISE NOTICE 'Weak hashes identified: %', mapped_count;

    -- =========================================================
    -- 3. Disable the identity and profile privilege triggers
    -- =========================================================

    EXECUTE 'ALTER TABLE public.whispers_matches
             DISABLE TRIGGER enforce_whispers_match_identity';

    EXECUTE 'ALTER TABLE public.whispers_messages
             DISABLE TRIGGER enforce_whispers_message_identity';

    EXECUTE 'ALTER TABLE public.profiles
             DISABLE TRIGGER enforce_profile_privilege_updates';

    EXECUTE 'ALTER TABLE public.profiles
             DISABLE TRIGGER sync_is_super_admin_flag';

    EXECUTE 'ALTER TABLE public.profiles
             DISABLE TRIGGER audit_profile_privileged_change';

    -- =========================================================
    -- 4. Update profiles
    -- =========================================================

    UPDATE public.profiles AS p
    SET circle_user_hash = m.new_hash
    FROM weak_hash_map AS m
    WHERE p.circle_user_hash = m.old_hash;

    -- =========================================================
    -- 5. Update Circle room memberships
    -- =========================================================

    UPDATE public.circle_room_members AS crm
    SET user_hash = m.new_hash
    FROM weak_hash_map AS m
    WHERE crm.user_hash = m.old_hash;

    -- =========================================================
    -- 6. Update Circle messages
    -- =========================================================

    UPDATE public.circle_messages AS cm
    SET user_hash = m.new_hash
    FROM weak_hash_map AS m
    WHERE cm.user_hash = m.old_hash;

    -- =========================================================
    -- 7. Update Whispers matches
    -- =========================================================

    UPDATE public.whispers_matches AS wm
    SET user1_hash = m.new_hash
    FROM weak_hash_map AS m
    WHERE wm.user1_hash = m.old_hash;

    UPDATE public.whispers_matches AS wm
    SET user2_hash = m.new_hash
    FROM weak_hash_map AS m
    WHERE wm.user2_hash = m.old_hash;

    -- =========================================================
    -- 8. Update Whispers messages
    -- =========================================================

    UPDATE public.whispers_messages AS msg
    SET sender_hash = m.new_hash
    FROM weak_hash_map AS m
    WHERE msg.sender_hash = m.old_hash;

    -- =========================================================
    -- 9. Update Whispers reports
    -- =========================================================

    UPDATE public.whispers_reports AS wr
    SET reporter_hash = m.new_hash
    FROM weak_hash_map AS m
    WHERE wr.reporter_hash = m.old_hash;

    -- =========================================================
    -- 10. Re-enable triggers
    -- =========================================================

    EXECUTE 'ALTER TABLE public.whispers_matches
             ENABLE TRIGGER enforce_whispers_match_identity';

    EXECUTE 'ALTER TABLE public.whispers_messages
             ENABLE TRIGGER enforce_whispers_message_identity';

    EXECUTE 'ALTER TABLE public.profiles
             ENABLE TRIGGER enforce_profile_privilege_updates';

    EXECUTE 'ALTER TABLE public.profiles
             ENABLE TRIGGER sync_is_super_admin_flag';

    EXECUTE 'ALTER TABLE public.profiles
             ENABLE TRIGGER audit_profile_privileged_change';

    -- =========================================================
    -- 11. Verify that no weak hashes remain
    -- =========================================================

    SELECT COUNT(*)
    INTO remaining_count
    FROM (
        SELECT circle_user_hash AS h
        FROM public.profiles

        UNION ALL

        SELECT user_hash
        FROM public.circle_room_members

        UNION ALL

        SELECT user_hash
        FROM public.circle_messages

        UNION ALL

        SELECT user1_hash
        FROM public.whispers_matches

        UNION ALL

        SELECT user2_hash
        FROM public.whispers_matches

        UNION ALL

        SELECT sender_hash
        FROM public.whispers_messages

        UNION ALL

        SELECT reporter_hash
        FROM public.whispers_reports
    ) AS all_hashes
    WHERE LEFT(h, 5) = 'user_'
      AND LENGTH(h) <= 13;

    IF remaining_count > 0 THEN
        RAISE EXCEPTION
            'Verification failed: % weak hashes remain.',
            remaining_count;
    END IF;

    RAISE NOTICE '===========================================';
    RAISE NOTICE 'LossLens hash migration completed.';
    RAISE NOTICE 'Weak hashes mapped: %', mapped_count;
    RAISE NOTICE 'Weak hashes remaining: %', remaining_count;
    RAISE NOTICE '===========================================';

END;
$migration$;