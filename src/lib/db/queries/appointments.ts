/**
 * FP相談予約 DB操作
 *
 * © Beautiful Days
 */

import { supabaseAdmin } from "../supabase";

export type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show";

export type FpAppointment = {
  id: string;
  memberId: string;
  scheduledAt: string;
  durationMinutes: number;
  hearingSummary: string | null;
  status: AppointmentStatus;
  fpName: string | null;
  notes: string | null;
  googleEventId: string | null;
  reminderSentAt: string | null;
  contactInfo: string | null;
  createdAt: string;
};

export type AppointmentWithMember = FpAppointment & {
  memberLineUserId: string | null;
  memberDisplayName: string | null;
};

/**
 * 予約を作成
 */
export async function createAppointment(input: {
  memberId: string;
  scheduledAt: string;
  durationMinutes?: number;
  hearingSummary?: string;
  fpName?: string;
  googleEventId?: string;
  contactInfo?: string;
}): Promise<FpAppointment | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_appointments")
    .insert({
      member_id: input.memberId,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes ?? 30,
      hearing_summary: input.hearingSummary ?? null,
      fp_name: input.fpName ?? null,
      google_event_id: input.googleEventId ?? null,
      contact_info: input.contactInfo ?? null,
      status: "scheduled",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[Appointments] 作成エラー", error);
    return null;
  }

  console.error("[Appointments] 作成成功", { id: data.id, google_event_id: data.google_event_id });
  return mapAppointment(data);
}

/**
 * 直近の予約一覧
 */
export async function getUpcomingAppointments(): Promise<FpAppointment[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_appointments")
    .select("*, members(display_name, plan)")
    .gte("scheduled_at", new Date().toISOString())
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });

  if (error || !data) {
    console.error("[Appointments] 取得エラー", error);
    return [];
  }

  return data.map(mapAppointment);
}

/**
 * 会員自身の予約一覧
 */
export async function getMemberAppointments(
  memberId: string,
): Promise<FpAppointment[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_appointments")
    .select("*")
    .eq("member_id", memberId)
    .order("scheduled_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(mapAppointment);
}

/**
 * 会員の直近の未キャンセル予約を取得
 */
export async function getLatestScheduledAppointment(
  memberId: string,
): Promise<FpAppointment | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_appointments")
    .select("*")
    .eq("member_id", memberId)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapAppointment(data);
}

/**
 * 予約をキャンセル済みに更新
 */
export async function cancelAppointment(
  appointmentId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("fp_appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  if (error) {
    console.error("[Appointments] キャンセル更新エラー", error);
    return false;
  }
  return true;
}

/**
 * 明日開催予定で、リマインド未送信の予約一覧（LINE push対象）
 */
export async function getAppointmentsForReminder(
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<AppointmentWithMember[]> {
  const { data, error } = await supabaseAdmin
    .from("fp_appointments")
    .select("*, members(line_user_id, display_name)")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .gte("scheduled_at", rangeStartIso)
    .lt("scheduled_at", rangeEndIso);

  if (error || !data) {
    console.error("[Appointments] リマインド対象取得エラー", error);
    return [];
  }

  return data
    .map((row) => ({
      ...mapAppointment(row),
      memberLineUserId: (row.members as { line_user_id: string | null } | null)?.line_user_id ?? null,
      memberDisplayName: (row.members as { display_name: string | null } | null)?.display_name ?? null,
    }))
    .filter((appt) => appt.memberLineUserId);
}

/**
 * リマインド送信枠を原子的に確保する（送信前に呼ぶ）
 *
 * reminder_sent_at IS NULL を条件にUPDATEし、実際に更新できた行があるかで
 * 判定する。同一予約に対してcronが同時・重複実行されても、
 * このUPDATEに成功できるのは1回だけであり、二重送信を防げる。
 */
export async function claimReminderSlot(appointmentId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("fp_appointments")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .is("reminder_sent_at", null)
    .select("id");

  if (error) {
    console.error("[Appointments] リマインド枠確保エラー", error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

function mapAppointment(row: Record<string, unknown>): FpAppointment {
  return {
    id: row.id as string,
    memberId: row.member_id as string,
    scheduledAt: row.scheduled_at as string,
    durationMinutes: (row.duration_minutes as number) ?? 30,
    hearingSummary: row.hearing_summary as string | null,
    status: row.status as AppointmentStatus,
    fpName: row.fp_name as string | null,
    notes: row.notes as string | null,
    googleEventId: (row.google_event_id as string) ?? null,
    reminderSentAt: (row.reminder_sent_at as string) ?? null,
    contactInfo: (row.contact_info as string) ?? null,
    createdAt: row.created_at as string,
  };
}
