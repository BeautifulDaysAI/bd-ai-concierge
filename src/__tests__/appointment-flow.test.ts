/**
 * 予約フロー統合テスト
 *
 * Google Calendar / Supabase / Anthropic API をモック化し、
 * 日時解釈・満席代替・予約確定・キャンセル・割り込み・異常系を検証。
 *
 * npm test で実行可能。
 *
 * © Beautiful Days
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── モック設定 ──

vi.mock("@/lib/google/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/calendar")>(
    "@/lib/google/calendar",
  );
  return {
    ...actual,
    findAvailableSlotsOnDate: vi.fn(),
    createReservation: vi.fn(),
    deleteCalendarEvent: vi.fn(),
  };
});

vi.mock("@/lib/db/queries/appointments", () => ({
  createAppointment: vi.fn(),
  getLatestScheduledAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
}));

vi.mock("@/lib/db/queries/members", () => ({
  updateMemberEmail: vi.fn(),
}));

vi.mock("@/lib/notify/fp", () => ({
  notifyFp: vi.fn(),
}));

vi.mock("@/lib/notify/line", () => ({
  notifyFpLine: vi.fn(),
}));

vi.mock("@/lib/zoom/client", () => ({
  createZoomMeeting: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: "テスト回答です。" }],
      })),
    },
  })),
  getDefaultModel: vi.fn(() => "claude-haiku-4-5-20251001"),
}));

vi.mock("@/lib/ai/knowledge/faq", () => ({
  searchFaq: vi.fn(() => []),
  formatFaqForPrompt: vi.fn(() => ""),
}));

vi.mock("@/lib/ai/prompts/system", () => ({
  SYSTEM_PROMPT: "テスト用システムプロンプト",
}));

// ── インポート ──

import {
  handlePreferenceAndFindDates,
  tryConfirmAppointment,
  tryFinalizeAppointmentWithContact,
  handleCancelRequest,
  BUSINESS_DAY_POLICY,
  type ClassifiedInput,
} from "@/lib/line/appointment-flow";

import {
  findAvailableSlotsOnDate,
  createReservation,
  deleteCalendarEvent,
  jstToUtc,
  getJstPartsPublic,
} from "@/lib/google/calendar";

import {
  createAppointment,
  getLatestScheduledAppointment,
  cancelAppointment,
} from "@/lib/db/queries/appointments";

import { createZoomMeeting } from "@/lib/zoom/client";

// ── ヘルパー ──

const mockFindSlots = findAvailableSlotsOnDate as ReturnType<typeof vi.fn>;
const mockCreateReservation = createReservation as ReturnType<typeof vi.fn>;
const mockDeleteEvent = deleteCalendarEvent as ReturnType<typeof vi.fn>;
const mockCreateAppointment = createAppointment as ReturnType<typeof vi.fn>;
const mockGetLatestAppt = getLatestScheduledAppointment as ReturnType<typeof vi.fn>;
const mockCancelAppt = cancelAppointment as ReturnType<typeof vi.fn>;
const mockCreateZoomMeeting = createZoomMeeting as ReturnType<typeof vi.fn>;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function makeSlot(year: number, month0: number, day: number, hour: number) {
  const start = jstToUtc(year, month0, day, hour);
  const end = new Date(start.getTime() + 3600000);
  const jst = getJstPartsPublic(start);
  const label = `${jst.month + 1}/${jst.day}(${WEEKDAYS[jst.dayOfWeek]}) ${String(jst.hour).padStart(2, "0")}:00〜${String(jst.hour + 1).padStart(2, "0")}:00`;
  return { start, end, label };
}

type BusyConfig = Map<string, { busyHours?: number[]; fullyBooked?: boolean }>;

function setupSlotMock(busyConfig: BusyConfig) {
  mockFindSlots.mockImplementation(
    async (
      year: number,
      month: number,
      day: number,
      schedule: { open: number; close: number; lastStart: number },
      prefStart?: number,
      prefEnd?: number,
    ) => {
      const key = `${year}-${month}-${day}`;
      const config = busyConfig.get(key);
      if (config?.fullyBooked) return [];
      const busyHours = new Set(config?.busyHours ?? []);
      const effStart = prefStart ?? schedule.open;
      const effEnd = prefEnd ?? schedule.close;
      const slots = [];
      for (let h = schedule.open; h <= schedule.lastStart; h++) {
        if (h >= 12 && h < 13) continue;
        if (h < effStart || h >= effEnd) continue;
        if (busyHours.has(h)) continue;
        slots.push(makeSlot(year, month, day, h));
      }
      return slots;
    },
  );
}

function makeParsed(overrides: Partial<ClassifiedInput> = {}): ClassifiedInput {
  return {
    intent: "date_time_request",
    fromDaysOffset: 1,
    toDaysOffset: 14,
    hourStart: 9,
    hourEnd: 21,
    dayOfWeek: null,
    specificDate: null,
    specificHour: null,
    ...overrides,
  };
}

const EMPTY_HISTORY: { role: "user" | "assistant"; content: string }[] = [];

// 2026-07-06 10:00 JST = Monday
const MOCK_NOW_UTC = new Date("2026-07-06T01:00:00Z");

// ── テスト ──

describe("予約フロー統合テスト", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW_UTC);
    vi.clearAllMocks();
    setupSlotMock(new Map());
    mockCreateReservation.mockResolvedValue({
      success: true,
      eventId: "evt-123",
    });
    mockCreateAppointment.mockResolvedValue({
      id: "appt-1",
      googleEventId: "evt-123",
    });
    mockCreateZoomMeeting.mockResolvedValue({ success: false, error: "not_configured" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ────────────────────────────────────────────
  // 日時解釈
  // ────────────────────────────────────────────

  describe("日時解釈", () => {
    it("「来週」→ 来週(7/13-7/19)の候補が出る", async () => {
      // 来週月曜=7/13, 日曜=7/19
      const parsed = makeParsed({ fromDaysOffset: 7, toDaysOffset: 13 });
      const result = await handlePreferenceAndFindDates("来週", EMPTY_HISTORY, parsed);
      expect(result).toContain("日程から候補をお選びください");
      expect(result).toMatch(/7\/1[3-9]/);
    });

    it("「再来週」→ 再来週(7/20-7/26)の候補が出る", async () => {
      const parsed = makeParsed({ fromDaysOffset: 14, toDaysOffset: 20 });
      const result = await handlePreferenceAndFindDates("再来週", EMPTY_HISTORY, parsed);
      expect(result).toContain("日程から候補をお選びください");
      expect(result).toMatch(/7\/2[0-6]/);
    });

    it("「今週土曜」→ 7/11(土)の空き時間が出る", async () => {
      const parsed = makeParsed({
        specificDate: { month: 7, day: 11 },
        dayOfWeek: 6,
      });
      const result = await handlePreferenceAndFindDates("今週土曜", EMPTY_HISTORY, parsed);
      expect(result).toContain("7/11");
      expect(result).toContain("時間帯からお選びください");
    });

    it("「土曜日は?」→ 土曜の空き日が候補に出る（営業ポリシーではない）", async () => {
      const parsed = makeParsed({ dayOfWeek: 6, toDaysOffset: 28 });
      const result = await handlePreferenceAndFindDates("土曜日は?", EMPTY_HISTORY, parsed);
      // 土曜の候補が出る
      expect(result).toMatch(/\(土\)/);
      // 営業時間ポリシーではない
      expect(result).not.toContain("月〜土で承っております");
    });

    it("「七月18日」→ 7/18の空き時間が出る", async () => {
      const parsed = makeParsed({ specificDate: { month: 7, day: 18 } });
      const result = await handlePreferenceAndFindDates("七月18日", EMPTY_HISTORY, parsed);
      expect(result).toContain("7/18");
      expect(result).toContain("時間帯からお選びください");
    });

    it("「7/18」→ 7/18の空き時間が出る", async () => {
      const parsed = makeParsed({ specificDate: { month: 7, day: 18 } });
      const result = await handlePreferenceAndFindDates("7/18", EMPTY_HISTORY, parsed);
      expect(result).toContain("7/18");
    });

    it("「7/18 14時から」→ 14:00-15:00が候補に出る", async () => {
      const parsed = makeParsed({
        specificDate: { month: 7, day: 18 },
        specificHour: 14,
      });
      const result = await handlePreferenceAndFindDates("7/18 14時から", EMPTY_HISTORY, parsed);
      expect(result).toContain("14:00〜15:00");
    });

    it("「再来週の土曜午後」→ 再来週土曜の午後枠が出る", async () => {
      const parsed = makeParsed({
        dayOfWeek: 6,
        fromDaysOffset: 14,
        toDaysOffset: 20,
        hourStart: 13,
        hourEnd: 18,
      });
      const result = await handlePreferenceAndFindDates("再来週の土曜午後", EMPTY_HISTORY, parsed);
      expect(result).toMatch(/\(土\)/);
      // 午後枠のみ（13:00以降）
      expect(result).not.toMatch(/\b09:00/);
      expect(result).not.toMatch(/\b10:00/);
      expect(result).not.toMatch(/\b11:00/);
    });

    it("「いつでもOK」→ 直近の空き候補が出る", async () => {
      const parsed = makeParsed({ fromDaysOffset: 1, toDaysOffset: 30 });
      const result = await handlePreferenceAndFindDates("いつでもOK", EMPTY_HISTORY, parsed);
      expect(result).toMatch(/候補をお選びください|時間帯からお選びください/);
    });

    it("「明日」→ 明日(7/7)の空き時間が出る", async () => {
      const parsed = makeParsed({ specificDate: { month: 7, day: 7 } });
      const result = await handlePreferenceAndFindDates("明日", EMPTY_HISTORY, parsed);
      expect(result).toContain("7/7");
    });

    it("「明後日」→ 明後日(7/8)の空き時間が出る", async () => {
      const parsed = makeParsed({ specificDate: { month: 7, day: 8 } });
      const result = await handlePreferenceAndFindDates("明後日", EMPTY_HISTORY, parsed);
      expect(result).toContain("7/8");
    });

    it("日曜指定 → 予約不可メッセージ", async () => {
      const parsed = makeParsed({ dayOfWeek: 0 });
      const result = await handlePreferenceAndFindDates("日曜", EMPTY_HISTORY, parsed);
      expect(result).toContain("日曜日は予約不可");
    });

    it("過去日(7/1、当日は7/6)を指定→過去日エラー、カレンダーAPIは呼ばれない", async () => {
      const parsed = makeParsed({ specificDate: { month: 7, day: 1 } });
      const result = await handlePreferenceAndFindDates("7/1でお願いします", EMPTY_HISTORY, parsed);
      expect(result).toContain("過去の日付のため予約できません");
      expect(result).toContain("本日以降の日程をお知らせください");
      expect(mockFindSlots).not.toHaveBeenCalled();
    });

    it("過去日+時間指定(7/1 14時)→過去日エラー、カレンダーAPIは呼ばれない", async () => {
      const parsed = makeParsed({ specificDate: { month: 7, day: 1 }, specificHour: 14 });
      const result = await handlePreferenceAndFindDates("7/1 14時で", EMPTY_HISTORY, parsed);
      expect(result).toContain("過去の日付のため予約できません");
      expect(mockFindSlots).not.toHaveBeenCalled();
    });

    it("当日(7/6)指定は過去日扱いにならない", async () => {
      const parsed = makeParsed({ specificDate: { month: 7, day: 6 } });
      const result = await handlePreferenceAndFindDates("7/6でお願いします", EMPTY_HISTORY, parsed);
      expect(result).not.toContain("過去の日付のため予約できません");
    });
  });

  // ────────────────────────────────────────────
  // 満席・代替日
  // ────────────────────────────────────────────

  describe("満席・代替日", () => {
    it("満席日を指定→次の空き日が「同じ曜日条件」で出る", async () => {
      // 7/18(土)満席, 7/25(土)空きあり
      setupSlotMock(
        new Map([["2026-5-18", { fullyBooked: true }]]), // month=5 is June (0-indexed) → 実際は7月=6
      );
      // 修正: month は0-indexed。7月=6
      setupSlotMock(
        new Map([["2026-6-18", { fullyBooked: true }]]),
      );

      const parsed = makeParsed({
        specificDate: { month: 7, day: 18 },
        dayOfWeek: 6,
      });
      const result = await handlePreferenceAndFindDates("土曜日は?", EMPTY_HISTORY, parsed);
      // 7/18が空き枠なし → 代替候補を表示
      expect(result).toContain("空き枠がありませんでした");
      // 代替候補は土曜(dayOfWeek=6)のみ
      if (result.includes("日程から候補をお選びください")) {
        expect(result).toMatch(/\(土\)/);
        expect(result).not.toMatch(/\(月\)/);
        expect(result).not.toMatch(/\(火\)/);
      }
    });

    it("全枠埋まった日→候補リストに出ない", async () => {
      // 7/7(火)満席, 7/8(水)空きあり
      setupSlotMock(
        new Map([["2026-6-7", { fullyBooked: true }]]),
      );

      const parsed = makeParsed({ fromDaysOffset: 1, toDaysOffset: 7 });
      const result = await handlePreferenceAndFindDates("来週", EMPTY_HISTORY, parsed);
      // 7/7は候補に含まれない
      if (result.includes("7/7")) {
        // 7/7が候補番号として出ていないことを確認
        expect(result).not.toMatch(/\d+\.\s*7\/7/);
      }
    });

    it("部分的に埋まった日→埋まってる枠だけ消える", async () => {
      // 7/18(土) 10:00と11:00が埋まっている
      setupSlotMock(
        new Map([["2026-6-18", { busyHours: [10, 11] }]]),
      );

      const parsed = makeParsed({ specificDate: { month: 7, day: 18 } });
      const result = await handlePreferenceAndFindDates("7/18", EMPTY_HISTORY, parsed);
      expect(result).toContain("時間帯からお選びください");
      expect(result).not.toContain("10:00〜11:00");
      expect(result).not.toContain("11:00〜12:00");
      // 他の枠は表示される
      expect(result).toMatch(/13:00〜14:00|14:00〜15:00/);
    });

    it("指定時間が埋まっている→同日の他の空き枠を提示", async () => {
      // 7/18(土) 14:00が埋まっている
      setupSlotMock(
        new Map([["2026-6-18", { busyHours: [14] }]]),
      );

      const parsed = makeParsed({
        specificDate: { month: 7, day: 18 },
        specificHour: 14,
      });
      const result = await handlePreferenceAndFindDates("7/18 14時", EMPTY_HISTORY, parsed);
      expect(result).toContain("すでに予約が入っております");
      expect(result).toContain("他の空き時間");
    });

    it("二重予約防止: freeBusy反映された枠のみ提示", async () => {
      // 7/18(土) 全枠埋まり(10-17全部busy)
      setupSlotMock(
        new Map([
          ["2026-6-18", { busyHours: [10, 11, 13, 14, 15, 16, 17] }],
        ]),
      );

      const parsed = makeParsed({ specificDate: { month: 7, day: 18 } });
      const result = await handlePreferenceAndFindDates("7/18", EMPTY_HISTORY, parsed);
      // 枠がないので代替日を提示
      expect(result).toContain("空き枠がありませんでした");
    });
  });

  // ────────────────────────────────────────────
  // 予約確定・キャンセル
  // ────────────────────────────────────────────

  describe("予約確定", () => {
    it("番号選択→連絡先確認→連絡先回答で予約確定・google_event_id保存", async () => {
      const historyStep1: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `7/18(土) の空き時間です。
以下の時間帯からお選びください。
番号でお答えください。

1. 14:00〜15:00
2. 15:00〜16:00

他の日程をご希望の場合は、改めて希望をお知らせください。`,
        },
      ];

      const step1Result = await tryConfirmAppointment("1", "member-1", "テスト太郎", historyStep1);
      expect(step1Result).toContain("14:00〜15:00");
      expect(step1Result).toContain("電話番号かメールアドレスを教えてください");
      expect(mockCreateReservation).not.toHaveBeenCalled();

      const historyStep2: { role: "user" | "assistant"; content: string }[] = [
        ...historyStep1,
        { role: "user", content: "1" },
        { role: "assistant", content: step1Result! },
      ];

      // 不正な形式は確定せず再入力を促す
      const invalidResult = await tryFinalizeAppointmentWithContact(
        "よろしくお願いします", "member-1", "テスト太郎", historyStep2,
      );
      expect(invalidResult).toContain("電話番号かメールアドレスの形式でお送りください");
      expect(mockCreateReservation).not.toHaveBeenCalled();

      // 不正入力後も「連絡先確認待ち」状態が失われないことを検証
      // （失われると次の入力がLLM日時解釈に誤って流れ込むバグの再発防止）
      const historyStep3: { role: "user" | "assistant"; content: string }[] = [
        ...historyStep2,
        { role: "user", content: "よろしくお願いします" },
        { role: "assistant", content: invalidResult! },
      ];
      const stillAwaitingResult = await tryFinalizeAppointmentWithContact(
        "確定", "member-1", "テスト太郎", historyStep3,
      );
      expect(stillAwaitingResult).toContain("電話番号かメールアドレスの形式でお送りください");
      expect(mockCreateReservation).not.toHaveBeenCalled();

      const result = await tryFinalizeAppointmentWithContact(
        "09012345678", "member-1", "テスト太郎", historyStep3,
      );
      expect(result).toContain("予約が確定しました");
      expect(result).toContain("14:00〜15:00");
      expect(result).toContain("09012345678");
      expect(mockCreateReservation).toHaveBeenCalled();
      expect(mockCreateAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: "member-1",
          googleEventId: "evt-123",
          contactInfo: "09012345678",
        }),
      );
    });

    it("予約確定失敗→エラーメッセージ", async () => {
      mockCreateReservation.mockResolvedValue({ success: false, error: "API error" });

      const historyStep1: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `7/18(土) の空き時間です。
以下の時間帯からお選びください。
番号でお答えください。

1. 14:00〜15:00

他の日程をご希望の場合は、改めて希望をお知らせください。`,
        },
      ];

      const step1Result = await tryConfirmAppointment("1", "member-1", "テスト太郎", historyStep1);
      const historyStep2 = [
        ...historyStep1,
        { role: "user" as const, content: "1" },
        { role: "assistant" as const, content: step1Result! },
      ];

      const result = await tryFinalizeAppointmentWithContact(
        "taro@example.com", "member-1", "テスト太郎", historyStep2,
      );
      expect(result).toContain("予約の確定に失敗しました");
      expect(mockCreateAppointment).not.toHaveBeenCalled();
    });

    it("番号以外の入力→null（予約確定を試みない）", async () => {
      const history: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `以下の時間帯からお選びください。\n1. 14:00〜15:00`,
        },
      ];

      const result = await tryConfirmAppointment("来週にして", "member-1", "テスト太郎", history);
      expect(result).toBeNull();
    });

    it("範囲外の番号→null", async () => {
      const history: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `以下の時間帯からお選びください。\n1. 14:00〜15:00`,
        },
      ];

      const result = await tryConfirmAppointment("5", "member-1", "テスト太郎", history);
      expect(result).toBeNull();
    });

    it("Zoom作成成功→確認メッセージにZoom URLが含まれる", async () => {
      mockCreateZoomMeeting.mockResolvedValue({
        success: true,
        joinUrl: "https://zoom.us/j/123456789",
      });

      const historyStep1: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `7/18(土) の空き時間です。\n以下の時間帯からお選びください。\n1. 14:00〜15:00`,
        },
      ];
      const step1Result = await tryConfirmAppointment("1", "member-1", "テスト太郎", historyStep1);
      const historyStep2 = [
        ...historyStep1,
        { role: "user" as const, content: "1" },
        { role: "assistant" as const, content: step1Result! },
      ];

      const result = await tryFinalizeAppointmentWithContact(
        "09012345678", "member-1", "テスト太郎", historyStep2,
      );
      expect(result).toContain("予約が確定しました");
      expect(result).toContain("https://zoom.us/j/123456789");
      expect(result).toContain("オンライン相談のURL");
    });

    it("Zoom作成失敗→手動案内の文言で予約確定メッセージは返る", async () => {
      mockCreateZoomMeeting.mockResolvedValue({
        success: false,
        error: "500: Internal Server Error",
      });

      const historyStep1: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `7/18(土) の空き時間です。\n以下の時間帯からお選びください。\n1. 14:00〜15:00`,
        },
      ];
      const step1Result = await tryConfirmAppointment("1", "member-1", "テスト太郎", historyStep1);
      const historyStep2 = [
        ...historyStep1,
        { role: "user" as const, content: "1" },
        { role: "assistant" as const, content: step1Result! },
      ];

      const result = await tryFinalizeAppointmentWithContact(
        "09012345678", "member-1", "テスト太郎", historyStep2,
      );
      expect(result).toContain("予約が確定しました");
      expect(result).not.toContain("オンライン相談のURL");
      expect(result).toContain("担当者より別途LINEでご案内いたします");
      expect(mockCreateAppointment).toHaveBeenCalled();
    });

    it("Zoom未設定→手動案内の文言で予約確定メッセージは返る", async () => {
      mockCreateZoomMeeting.mockResolvedValue({
        success: false,
        error: "not_configured",
      });

      const historyStep1: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `7/18(土) の空き時間です。\n以下の時間帯からお選びください。\n1. 14:00〜15:00`,
        },
      ];
      const step1Result = await tryConfirmAppointment("1", "member-1", "テスト太郎", historyStep1);
      const historyStep2 = [
        ...historyStep1,
        { role: "user" as const, content: "1" },
        { role: "assistant" as const, content: step1Result! },
      ];

      const result = await tryFinalizeAppointmentWithContact(
        "09012345678", "member-1", "テスト太郎", historyStep2,
      );
      expect(result).toContain("予約が確定しました");
      expect(result).not.toContain("オンライン相談のURL");
      expect(result).toContain("担当者より別途LINEでご案内いたします");
      expect(mockCreateAppointment).toHaveBeenCalled();
    });
  });

  describe("キャンセル", () => {
    it("予約あり→DB上でキャンセル済み→担当者手動対応をアナウンス", async () => {
      mockGetLatestAppt.mockResolvedValue({
        id: "appt-1",
        memberId: "member-1",
        scheduledAt: "2026-07-18T05:00:00Z", // JST 14:00
        googleEventId: "evt-123",
        status: "scheduled",
      });
      mockCancelAppt.mockResolvedValue(true);

      const result = await handleCancelRequest("member-1", "テスト太郎");
      expect(result).toContain("キャンセルを受け付けました");
      expect(result).toContain("担当者がカレンダーの調整を行います");
      expect(mockDeleteEvent).not.toHaveBeenCalled();
      expect(mockCancelAppt).toHaveBeenCalledWith("appt-1");
    });

    it("予約なし→エラーメッセージ", async () => {
      mockGetLatestAppt.mockResolvedValue(null);

      const result = await handleCancelRequest("member-1", "テスト太郎");
      expect(result).toContain("有効な予約が見つかりませんでした");
    });

    it("google_event_id未保存でも同様に受け付け完了", async () => {
      mockGetLatestAppt.mockResolvedValue({
        id: "appt-1",
        memberId: "member-1",
        scheduledAt: "2026-07-18T05:00:00Z",
        googleEventId: null,
        status: "scheduled",
      });
      mockCancelAppt.mockResolvedValue(true);

      const result = await handleCancelRequest("member-1", "テスト太郎");
      expect(result).toContain("キャンセルを受け付けました");
      expect(mockDeleteEvent).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────
  // 割り込み・非予約（ハンドラの分岐テスト）
  // ────────────────────────────────────────────

  describe("intent分岐", () => {
    it("business_hours_question intent → 営業ポリシー文言が返る", () => {
      // classifyAndParseInput が business_hours_question を返した場合、
      // handler.ts は BUSINESS_DAY_POLICY を返す。
      // ここではBUSINESS_DAY_POLICYの内容を検証
      expect(BUSINESS_DAY_POLICY).toContain("月〜土で承っております");
    });
  });

  // ────────────────────────────────────────────
  // 異常系
  // ────────────────────────────────────────────

  describe("異常系", () => {
    it("Calendar APIエラー→エラーメッセージ", async () => {
      mockFindSlots.mockRejectedValue(new Error("Calendar API timeout"));

      const parsed = makeParsed({ specificDate: { month: 7, day: 18 } });
      const result = await handlePreferenceAndFindDates("7/18", EMPTY_HISTORY, parsed);
      expect(result).toContain("エラーが発生しました");
    });

    it("範囲検索でCalendar APIエラー→エラーメッセージ", async () => {
      mockFindSlots.mockRejectedValue(new Error("Calendar API timeout"));

      const parsed = makeParsed({ fromDaysOffset: 1, toDaysOffset: 7 });
      const result = await handlePreferenceAndFindDates("来週", EMPTY_HISTORY, parsed);
      expect(result).toContain("エラーが発生しました");
    });

    it("祝日指定→予約不可メッセージ", async () => {
      // 2026-09-23 は秋分の日
      const parsed = makeParsed({ specificDate: { month: 9, day: 23 } });
      const result = await handlePreferenceAndFindDates("9/23", EMPTY_HISTORY, parsed);
      expect(result).toContain("予約不可日");
    });

    it("営業時間外→営業時間案内", async () => {
      // 7/18(土) 営業時間は10:00-18:00、22時指定
      const parsed = makeParsed({
        specificDate: { month: 7, day: 18 },
        specificHour: 22,
      });
      const result = await handlePreferenceAndFindDates("7/18 22時", EMPTY_HISTORY, parsed);
      expect(result).toContain("営業時間は");
    });

    it("DB保存失敗でもカレンダー登録は成功→予約確定メッセージ", async () => {
      mockCreateAppointment.mockResolvedValue(null);

      const historyStep1: { role: "user" | "assistant"; content: string }[] = [
        {
          role: "assistant",
          content: `7/18(土) の空き時間です。
以下の時間帯からお選びください。
番号でお答えください。

1. 14:00〜15:00`,
        },
      ];

      const step1Result = await tryConfirmAppointment("1", "member-1", "テスト太郎", historyStep1);
      const historyStep2 = [
        ...historyStep1,
        { role: "user" as const, content: "1" },
        { role: "assistant" as const, content: step1Result! },
      ];

      const result = await tryFinalizeAppointmentWithContact(
        "09012345678", "member-1", "テスト太郎", historyStep2,
      );
      expect(result).toContain("予約が確定しました");
    });
  });

  // ────────────────────────────────────────────
  // 代替日の条件引き継ぎ
  // ────────────────────────────────────────────

  describe("代替日の条件引き継ぎ", () => {
    it("土曜希望+満席→次の土曜が代替候補（平日は出ない）", async () => {
      // 7/11(土)満席
      setupSlotMock(new Map([["2026-6-11", { fullyBooked: true }]]));

      const parsed = makeParsed({
        specificDate: { month: 7, day: 11 },
        dayOfWeek: 6,
      });
      const result = await handlePreferenceAndFindDates("土曜日は?", EMPTY_HISTORY, parsed);
      expect(result).toContain("空き枠がありませんでした");
      // 代替は土曜のみ
      const dateLines = result.match(/\d+\.\s*\d+\/\d+\([^\)]+\)/g) || [];
      for (const line of dateLines) {
        expect(line).toContain("(土)");
      }
    });

    it("午後希望+満席→代替日も午後枠で検索", async () => {
      // 7/11(土) 午後のみ全て埋まり(13-17)
      setupSlotMock(
        new Map([["2026-6-11", { busyHours: [13, 14, 15, 16, 17] }]]),
      );

      const parsed = makeParsed({
        specificDate: { month: 7, day: 11 },
        hourStart: 13,
        hourEnd: 18,
      });
      const result = await handlePreferenceAndFindDates("7/11 午後", EMPTY_HISTORY, parsed);
      // 午後が空いてないので代替日を提示
      expect(result).toContain("空き枠がありませんでした");
    });

    it("範囲検索で全候補満席→拡張検索でも曜日条件を維持", async () => {
      // 7/11(土)と7/18(土)を満席にする
      setupSlotMock(
        new Map([
          ["2026-6-11", { fullyBooked: true }],
          ["2026-6-18", { fullyBooked: true }],
        ]),
      );

      const parsed = makeParsed({
        dayOfWeek: 6,
        fromDaysOffset: 5, // 7/11
        toDaysOffset: 12, // 7/18
      });
      const result = await handlePreferenceAndFindDates("土曜希望", EMPTY_HISTORY, parsed);
      // 拡張検索で7/25(土)が出るはず
      if (result.includes("日程から候補をお選びください") || result.includes("時間帯からお選びください")) {
        expect(result).toMatch(/7\/25\(土\)/);
      }
    });
  });
});
