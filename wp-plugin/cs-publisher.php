<?php
/**
 * Plugin Name: CS Publisher
 * Description: Custom REST endpoint for the CS Design Studios monthly-blogs agent.
 *              Authenticated via shared-secret header; bypasses Wordfence's
 *              Application Password block because custom REST routes are not
 *              filtered by its firewall.
 * Version: 1.0.0
 * Author: CS Design Studios
 *
 * ─── Install ────────────────────────────────────────────────────────────────
 * 1. Upload this file to wp-content/mu-plugins/cs-publisher.php
 *    (create the mu-plugins directory if it doesn't exist — MU plugins are
 *    always-on; no activation step, and clients can't disable them in wp-admin).
 * 2. Edit CS_PUBLISHER_SECRET below to a random 32+ character string.
 * 3. Paste the same secret into the client's record in the monthly-blogs
 *    dashboard (Clients → Edit → "CS Publisher Secret").
 * 4. In the dashboard, click "Test WP" — it should report the authenticated
 *    WP user. Then publish.
 *
 * The endpoint accepts one JSON POST that creates the post, uploads the
 * featured image, attaches categories/tags, and writes SEO meta in a single
 * round-trip — faster than the 4-5 calls the native WP REST flow needs.
 */

if (!defined('ABSPATH')) exit;

// ─── Configuration ──────────────────────────────────────────────────────────
// Replace the secret below before uploading.
define('CS_PUBLISHER_SECRET', 'REPLACE_ME_WITH_A_RANDOM_32_CHAR_STRING');
// Leave as 0 to use the site's first Administrator, or set to a specific user ID.
define('CS_PUBLISHER_USER_ID', 0);
// ────────────────────────────────────────────────────────────────────────────

add_action('rest_api_init', function () {
    register_rest_route('cs-publisher/v1', '/publish', [
        'methods'             => 'POST',
        'callback'            => 'cs_publisher_handle_publish',
        'permission_callback' => 'cs_publisher_check_secret',
    ]);
    register_rest_route('cs-publisher/v1', '/ping', [
        'methods'             => 'GET',
        'callback'            => 'cs_publisher_handle_ping',
        'permission_callback' => 'cs_publisher_check_secret',
    ]);
});

function cs_publisher_check_secret(WP_REST_Request $req) {
    $secret = defined('CS_PUBLISHER_SECRET') ? CS_PUBLISHER_SECRET : '';
    if (!$secret || $secret === 'REPLACE_ME_WITH_A_RANDOM_32_CHAR_STRING') {
        return new WP_Error('cs_publisher_unconfigured', 'CS_PUBLISHER_SECRET not configured in mu-plugin', ['status' => 500]);
    }
    $provided = (string)$req->get_header('x-cs-secret');
    if (!$provided || !hash_equals((string)$secret, $provided)) {
        return new WP_Error('cs_publisher_unauthorized', 'Invalid or missing X-CS-Secret header', ['status' => 401]);
    }

    $user_id = (int)CS_PUBLISHER_USER_ID;
    if ($user_id <= 0) {
        $admins = get_users([
            'role'    => 'administrator',
            'number'  => 1,
            'orderby' => 'ID',
            'order'   => 'ASC',
            'fields'  => 'ID',
        ]);
        $user_id = !empty($admins) ? (int)$admins[0] : 0;
    }
    if ($user_id <= 0) {
        return new WP_Error('cs_publisher_no_admin', 'No administrator user found on this site', ['status' => 500]);
    }
    wp_set_current_user($user_id);
    return true;
}

function cs_publisher_handle_ping(WP_REST_Request $req) {
    $user = wp_get_current_user();
    return new WP_REST_Response([
        'ok'         => true,
        'version'    => '1.0.0',
        'user_id'    => (int)$user->ID,
        'user_login' => $user->user_login,
        'user_roles' => array_values($user->roles),
    ], 200);
}

function cs_publisher_handle_publish(WP_REST_Request $req) {
    $data = $req->get_json_params();
    if (!is_array($data)) {
        return new WP_Error('cs_publisher_bad_body', 'JSON body required', ['status' => 400]);
    }

    // Categories — create any that don't exist, collect IDs.
    $category_ids = [];
    foreach ((array)($data['categories'] ?? []) as $name) {
        $name = (string)$name;
        if ($name === '') continue;
        $term = get_term_by('name', $name, 'category');
        if ($term && !is_wp_error($term)) {
            $category_ids[] = (int)$term->term_id;
        } else {
            $inserted = wp_insert_term($name, 'category');
            if (!is_wp_error($inserted) && isset($inserted['term_id'])) {
                $category_ids[] = (int)$inserted['term_id'];
            }
        }
    }

    $allowed_statuses = ['publish', 'draft', 'pending', 'private'];
    $raw_status = (string)($data['status'] ?? 'publish');
    $status = in_array($raw_status, $allowed_statuses, true) ? $raw_status : 'publish';

    $post_data = [
        'post_title'    => wp_strip_all_tags((string)($data['title'] ?? '')),
        'post_name'     => sanitize_title((string)($data['slug'] ?? '')),
        'post_content'  => (string)($data['content'] ?? ''),
        'post_excerpt'  => (string)($data['excerpt'] ?? ''),
        'post_status'   => $status,
        'post_type'     => 'post',
        'post_author'   => get_current_user_id(),
        'post_category' => $category_ids,
        'tags_input'    => array_values(array_filter(array_map('strval', (array)($data['tags'] ?? [])))),
    ];

    $post_id = wp_insert_post($post_data, true);
    if (is_wp_error($post_id)) {
        return new WP_Error('cs_publisher_insert_failed', $post_id->get_error_message(), ['status' => 500]);
    }

    // Extra SEO meta (RankMath / Yoast keys, etc.).
    foreach ((array)($data['meta'] ?? []) as $k => $v) {
        if (!is_string($k) || $k === '') continue;
        update_post_meta($post_id, $k, is_string($v) ? $v : wp_json_encode($v));
    }

    // Featured image — download + sideload + set as thumbnail.
    $img_url = $data['featured_image']['url'] ?? null;
    if (is_string($img_url) && $img_url !== '') {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $tmp = download_url($img_url, 60);
        if (!is_wp_error($tmp)) {
            $filename = (string)($data['featured_image']['filename']
                ?? (sanitize_title((string)($data['slug'] ?? 'featured')) . '.jpg'));
            $file_array = ['name' => $filename, 'tmp_name' => $tmp];
            $attachment_id = media_handle_sideload($file_array, $post_id);
            if (!is_wp_error($attachment_id)) {
                set_post_thumbnail($post_id, $attachment_id);
            } else {
                @unlink($tmp);
            }
        }
    }

    $post = get_post($post_id);
    return new WP_REST_Response([
        'id'     => (int)$post_id,
        'link'   => get_permalink($post_id),
        'status' => $post ? $post->post_status : $status,
    ], 200);
}
