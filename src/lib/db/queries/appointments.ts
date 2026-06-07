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
  createdAt: string;
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
}): Promise<FpAppointment | null> {
  const { data, error } = await supabaseAdmin
    .from("fp_appointments")
    .insert({
      member_id: input.memberId,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes ?? 30,
      hearing_summary: input.hearingSummary ?? null,
      fp_name: input.fpName ?? null,
      status: "scheduled",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[Appointments] 作成エラー", error);
    return null;
  }

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
    createdAt: row.created_at as string,
  };
}
