import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// This edge function is called by a Postgres trigger via pg_net
// OR can be called directly by the admin panel when updating a report status

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { report_id, new_status, old_status } = await req.json();

    if (!report_id || !new_status) {
      return new Response(JSON.stringify({ error: 'Missing report_id or new_status' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only notify on meaningful status changes
    const notifiableStatuses = ['Verified', 'Resolved', 'Rejected', 'ready_for_lgu'];
    if (!notifiableStatuses.includes(new_status)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Status not notifiable' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Don't re-notify same status
    if (old_status === new_status) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Status unchanged' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the report to get user_id and report_type
    const { data: report, error: fetchError } = await supabase
      .from('incident_report')
      .select('user_id, report_type, hazard_type, description')
      .eq('report_id', report_id)
      .maybeSingle();

    if (fetchError || !report?.user_id) {
      console.error('❌ Could not fetch report:', fetchError);
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build label from report_type
    const reportLabel =
      report.report_type === 'quick_snap'      ? 'Quick Snap Report'  :
      report.report_type === 'moderate_report' ? 'Moderate Report'    :
      report.report_type === 'general_inquiries' ? 'General Inquiry'  :
      'Report';

    // Build notification content per status
    let title   = '';
    let message = '';
    let type    = 'Updates';

    if (new_status === 'Verified') {
      title   = `Your ${reportLabel} has been Verified ✅`;
      message = `Great news! Your ${reportLabel.toLowerCase()} has been reviewed and verified by our team. Responders have been notified and are taking action.`;
      type    = 'Updates';
    } else if (new_status === 'Resolved') {
      title   = `Your ${reportLabel} has been Resolved ✅`;
      message = `Your ${reportLabel.toLowerCase()} has been resolved. Thank you for helping keep your community safe!`;
      type    = 'Updates';
    } else if (new_status === 'ready_for_lgu') {
      title   = `Your ${reportLabel} is Ready for LGU 📋`;
      message = `Your ${reportLabel.toLowerCase()} has been escalated and is ready for Local Government Unit response.`;
      type    = 'Updates';
    } else if (new_status === 'Rejected') {
      title   = `Your ${reportLabel} was not accepted`;
      message = `We reviewed your ${reportLabel.toLowerCase()} and could not verify it as a valid flood or hazard incident. Please submit a clearer photo if the situation is real.`;
      type    = 'Updates';
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id:     report.user_id,
        title,
        message,
        type,
        is_read:     false,
        target_role: 'user',
        created_at:  new Date().toISOString(),
      });

    if (notifError) {
      console.error('❌ Notification insert failed:', notifError);
      return new Response(JSON.stringify({ error: notifError.message }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Notification sent for report ${report_id} → ${new_status}`);

    return new Response(JSON.stringify({ success: true, status: new_status }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('❌ notify-report-status error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
