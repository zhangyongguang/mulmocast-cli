import "dotenv/config";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoInfo {
    id: string;
    title: string;
    publishedAt: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    favoriteCount: number;
    duration: string;
    thumbnail: string;
}

interface AnalysisReport {
    channelTitle: string;
    totalVideos: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    avgViews: number;
    avgLikes: number;
    avgComments: number;
    avgEngagementRate: number;
    topVideos: VideoInfo[];
    worstVideos: VideoInfo[];
    recentVideos: VideoInfo[];
    allVideos: VideoInfo[];
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiGet(endpoint: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.set("key", YOUTUBE_API_KEY!);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`YouTube API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Resolve a channel handle (e.g. @DeepDive) or channel ID to { channelId, channelTitle }
 */
async function resolveChannel(input: string): Promise<{ channelId: string; channelTitle: string }> {
    // If it starts with @ treat as handle
    if (input.startsWith("@")) {
        const data = await apiGet("channels", {
            part: "snippet,contentDetails",
            forHandle: input.replace("@", ""),
        });
        const items = data.items as Array<Record<string, unknown>>;
        if (!items?.length) throw new Error(`找不到频道: ${input}`);
        const item = items[0];
        return {
            channelId: item.id as string,
            channelTitle: ((item.snippet as Record<string, unknown>).title) as string,
        };
    }

    // If it looks like a channel ID (starts with UC)
    if (input.startsWith("UC")) {
        const data = await apiGet("channels", {
            part: "snippet,contentDetails",
            id: input,
        });
        const items = data.items as Array<Record<string, unknown>>;
        if (!items?.length) throw new Error(`找不到频道: ${input}`);
        const item = items[0];
        return {
            channelId: item.id as string,
            channelTitle: ((item.snippet as Record<string, unknown>).title) as string,
        };
    }

    // Try as custom URL or username
    const data = await apiGet("search", {
        part: "snippet",
        q: input,
        type: "channel",
        maxResults: "1",
    });
    const items = data.items as Array<Record<string, unknown>>;
    if (!items?.length) throw new Error(`找不到频道: ${input}`);
    const channelId = ((items[0].snippet as Record<string, unknown>).channelId) as string;
    const channelTitle = ((items[0].snippet as Record<string, unknown>).channelTitle) as string;
    return { channelId, channelTitle };
}

/**
 * Get the uploads playlist ID for a channel
 */
async function getUploadsPlaylistId(channelId: string): Promise<string> {
    const data = await apiGet("channels", {
        part: "contentDetails",
        id: channelId,
    });
    const items = data.items as Array<Record<string, unknown>>;
    if (!items?.length) throw new Error("无法获取频道信息");
    const contentDetails = items[0].contentDetails as Record<string, unknown>;
    const relatedPlaylists = contentDetails.relatedPlaylists as Record<string, string>;
    return relatedPlaylists.uploads;
}

/**
 * Fetch video IDs from a playlist (paginated)
 */
async function fetchPlaylistVideoIds(playlistId: string, limit: number): Promise<string[]> {
    const videoIds: string[] = [];
    let pageToken = "";

    while (videoIds.length < limit) {
        const maxResults = Math.min(50, limit - videoIds.length);
        const params: Record<string, string> = {
            part: "contentDetails",
            playlistId,
            maxResults: maxResults.toString(),
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await apiGet("playlistItems", params);
        const items = data.items as Array<Record<string, unknown>>;
        if (!items?.length) break;

        for (const item of items) {
            const cd = item.contentDetails as Record<string, unknown>;
            videoIds.push(cd.videoId as string);
        }

        pageToken = (data.nextPageToken as string) || "";
        if (!pageToken) break;
    }

    return videoIds.slice(0, limit);
}

/**
 * Fetch video details & statistics in batches of 50
 */
async function fetchVideoDetails(videoIds: string[]): Promise<VideoInfo[]> {
    const videos: VideoInfo[] = [];

    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const data = await apiGet("videos", {
            part: "snippet,statistics,contentDetails",
            id: batch.join(","),
        });
        const items = data.items as Array<Record<string, unknown>>;
        if (!items) continue;

        for (const item of items) {
            const snippet = item.snippet as Record<string, unknown>;
            const stats = item.statistics as Record<string, string>;
            const cd = item.contentDetails as Record<string, string>;
            const thumbnails = snippet.thumbnails as Record<string, Record<string, unknown>>;
            const thumb = (thumbnails.medium || thumbnails.default) as Record<string, unknown>;

            videos.push({
                id: item.id as string,
                title: snippet.title as string,
                publishedAt: snippet.publishedAt as string,
                viewCount: parseInt(stats.viewCount || "0", 10),
                likeCount: parseInt(stats.likeCount || "0", 10),
                commentCount: parseInt(stats.commentCount || "0", 10),
                favoriteCount: parseInt(stats.favoriteCount || "0", 10),
                duration: cd.duration || "",
                thumbnail: (thumb?.url as string) || "",
            });
        }
    }

    return videos;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function analyzeVideos(channelTitle: string, videos: VideoInfo[]): AnalysisReport {
    const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);
    const byDate = [...videos].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
    const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
    const totalComments = videos.reduce((s, v) => s + v.commentCount, 0);
    const n = videos.length || 1;

    const engagementRates = videos.map((v) => (v.viewCount > 0 ? ((v.likeCount + v.commentCount) / v.viewCount) * 100 : 0));
    const avgEngagement = engagementRates.reduce((s, r) => s + r, 0) / n;

    return {
        channelTitle,
        totalVideos: videos.length,
        totalViews,
        totalLikes,
        totalComments,
        avgViews: Math.round(totalViews / n),
        avgLikes: Math.round(totalLikes / n),
        avgComments: Math.round(totalComments / n),
        avgEngagementRate: avgEngagement,
        topVideos: sorted.slice(0, 5),
        worstVideos: sorted.slice(-5).reverse(),
        recentVideos: byDate.slice(0, 10),
        allVideos: sorted,
    };
}

// ─── Output Formatting ──────────────────────────────────────────────────────

function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
}

function parseDuration(iso: string): string {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return iso;
    const h = match[1] ? `${match[1]}:` : "";
    const m = (match[2] || "0").padStart(2, "0");
    const s = (match[3] || "0").padStart(2, "0");
    return `${h}${m}:${s}`;
}

function printVideoTable(label: string, videos: VideoInfo[]) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  ${label}`);
    console.log(`${"═".repeat(70)}`);
    console.log(
        `  ${"#".padEnd(4)} ${"标题".padEnd(36)} ${"播放量".padStart(10)} ${"点赞".padStart(8)} ${"评论".padStart(8)} ${"时长".padStart(8)}`,
    );
    console.log(`  ${"─".repeat(66)}`);

    videos.forEach((v, i) => {
        const title = v.title.length > 16 ? v.title.slice(0, 15) + "…" : v.title;
        const engagement = v.viewCount > 0 ? (((v.likeCount + v.commentCount) / v.viewCount) * 100).toFixed(1) + "%" : "N/A";
        console.log(
            `  ${String(i + 1).padEnd(4)} ${title.padEnd(18)} ${formatNumber(v.viewCount).padStart(10)} ${formatNumber(v.likeCount).padStart(8)} ${formatNumber(v.commentCount).padStart(8)} ${parseDuration(v.duration).padStart(8)}  互动率: ${engagement}`,
        );
    });
}

function printReport(report: AnalysisReport) {
    console.log(`\n${"╔".padEnd(69, "═")}╗`);
    console.log(`║  📊 YouTube 频道分析报告: ${report.channelTitle}`.padEnd(69) + " ║");
    console.log(`${"╚".padEnd(69, "═")}╝`);

    console.log(`\n  📈 总览统计`);
    console.log(`  ${"─".repeat(40)}`);
    console.log(`  视频总数:     ${report.totalVideos}`);
    console.log(`  总播放量:     ${formatNumber(report.totalViews)}`);
    console.log(`  总点赞数:     ${formatNumber(report.totalLikes)}`);
    console.log(`  总评论数:     ${formatNumber(report.totalComments)}`);
    console.log(`  平均播放量:   ${formatNumber(report.avgViews)}`);
    console.log(`  平均点赞数:   ${formatNumber(report.avgLikes)}`);
    console.log(`  平均评论数:   ${formatNumber(report.avgComments)}`);
    console.log(`  平均互动率:   ${report.avgEngagementRate.toFixed(2)}%`);

    printVideoTable("🏆 播放量 TOP 5", report.topVideos);
    printVideoTable("📉 播放量最低 5 个", report.worstVideos);
    printVideoTable("🕐 最近发布的 10 个视频", report.recentVideos);
}

// ─── Export ──────────────────────────────────────────────────────────────────

async function exportJson(report: AnalysisReport, outputPath: string) {
    const { writeFile } = await import("node:fs/promises");
    const data = {
        generatedAt: new Date().toISOString(),
        channel: report.channelTitle,
        summary: {
            totalVideos: report.totalVideos,
            totalViews: report.totalViews,
            totalLikes: report.totalLikes,
            totalComments: report.totalComments,
            avgViews: report.avgViews,
            avgLikes: report.avgLikes,
            avgComments: report.avgComments,
            avgEngagementRate: report.avgEngagementRate,
        },
        videos: report.allVideos.map((v) => ({
            id: v.id,
            title: v.title,
            url: `https://youtu.be/${v.id}`,
            publishedAt: v.publishedAt,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
            duration: v.duration,
            engagementRate: v.viewCount > 0 ? ((v.likeCount + v.commentCount) / v.viewCount) * 100 : 0,
        })),
    };
    await writeFile(outputPath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`\n  ✅ 数据已导出到: ${outputPath}`);
}

async function exportCsv(report: AnalysisReport, outputPath: string) {
    const { writeFile } = await import("node:fs/promises");
    const header = "ID,标题,发布时间,播放量,点赞,评论,时长,链接,互动率(%)";
    const rows = report.allVideos.map((v) => {
        const engagement = v.viewCount > 0 ? (((v.likeCount + v.commentCount) / v.viewCount) * 100).toFixed(2) : "0";
        const title = v.title.replace(/"/g, '""');
        return `${v.id},"${title}",${v.publishedAt},${v.viewCount},${v.likeCount},${v.commentCount},${v.duration},https://youtu.be/${v.id},${engagement}`;
    });
    await writeFile(outputPath, [header, ...rows].join("\n"), "utf-8");
    console.log(`\n  ✅ CSV 已导出到: ${outputPath}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const yargs = (await import("yargs")).default;
    const { hideBin } = await import("yargs/helpers");

    const argv = await yargs(hideBin(process.argv))
        .usage("用法: $0 [--channel <频道ID或handle>]")
        .option("channel", {
            alias: "c",
            type: "string",
            description: "YouTube 频道 ID（UC 开头）或 handle（如 @DeepDive）。不指定则使用 .env 中的 YOUTUBE_CHANNEL_ID",
        })
        .option("limit", {
            alias: "l",
            type: "number",
            description: "获取视频数量上限",
            default: 50,
        })
        .option("export-json", {
            type: "string",
            description: "导出 JSON 到指定路径",
        })
        .option("export-csv", {
            type: "string",
            description: "导出 CSV 到指定路径",
        })
        .help()
        .alias("help", "h")
        .parse();

    if (!YOUTUBE_API_KEY) {
        console.error("❌ 错误: 请在 .env 文件中设置 YOUTUBE_API_KEY");
        console.error("   获取方式: https://console.cloud.google.com/ → 启用 YouTube Data API v3 → 创建 API Key");
        process.exit(1);
    }

    const channel = (argv.channel as string) || YOUTUBE_CHANNEL_ID;
    if (!channel) {
        console.error("❌ 错误: 请通过 --channel 参数指定频道，或在 .env 中设置 YOUTUBE_CHANNEL_ID");
        process.exit(1);
    }
    const limit = argv.limit as number;

    console.log(`\n  🔍 正在解析频道: ${channel} ...`);
    const { channelId, channelTitle } = await resolveChannel(channel);
    console.log(`  ✅ 频道: ${channelTitle} (${channelId})`);

    console.log(`  📥 正在获取上传列表 ...`);
    const playlistId = await getUploadsPlaylistId(channelId);

    console.log(`  📥 正在抓取最近 ${limit} 个视频 ...`);
    const videoIds = await fetchPlaylistVideoIds(playlistId, limit);
    console.log(`  ✅ 找到 ${videoIds.length} 个视频`);

    console.log(`  📊 正在获取视频统计数据 ...`);
    const videos = await fetchVideoDetails(videoIds);

    const report = analyzeVideos(channelTitle, videos);
    printReport(report);

    if (argv["export-json"]) {
        await exportJson(report, argv["export-json"] as string);
    }
    if (argv["export-csv"]) {
        await exportCsv(report, argv["export-csv"] as string);
    }

    if (!argv["export-json"] && !argv["export-csv"]) {
        console.log(`\n  💡 提示: 使用 --export-json <路径> 或 --export-csv <路径> 导出数据`);
    }
    console.log("");
}

main().catch((err) => {
    console.error("❌ 执行失败:", err.message || err);
    process.exit(1);
});
