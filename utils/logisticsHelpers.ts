/**
 * Logistics & Support Unified Helpers
 * Handles Drop-off Point extraction, Return Dates, Delivery Status, and Filtering
 */

export interface ParsedLogisticsDetails {
    dropoff: string;
    cleanNotes: string;
    urgency?: string;
}

export interface ReturnStatusInfo {
    status: 'No Return Required' | 'Pending Return' | 'Overdue' | 'Returned';
    label: string;
    isOverdue: boolean;
    bgColor: string;
    textColor: string;
    borderColor: string;
    expectedDateFormatted: string;
    actualDateFormatted?: string;
}

export type DeliveryStatusType = 'Pending Delivery' | 'In Transit' | 'Delivered' | 'Received';

/**
 * Parses user notes and drop-off point from request_reason and raw drop_off_address
 */
export function parseDropOffAndNotes(
    rawReason?: string | null,
    rawDropOff?: string | null,
    muniName?: string | null
): ParsedLogisticsDetails {
    let dropoff = '';
    let cleanNotes = (rawReason || '').trim();

    // 1. Check if tagged [Drop-off: ...] in request_reason
    const dropOffMatch = cleanNotes.match(/\[Drop-off:\s*([^\]]+)\]/i);
    if (dropOffMatch && dropOffMatch[1]) {
        dropoff = dropOffMatch[1].trim();
        // Remove the [Drop-off: ...] tag from cleanNotes
        cleanNotes = cleanNotes.replace(/\[Drop-off:\s*[^\]]+\]/gi, '').trim();
    }

    // Also check for [Urgency: ...] tag if present
    let urgency: string | undefined = undefined;
    const urgencyMatch = cleanNotes.match(/\[Urgency:\s*([^\]]+)\]/i);
    if (urgencyMatch && urgencyMatch[1]) {
        urgency = urgencyMatch[1].trim();
        cleanNotes = cleanNotes.replace(/\[Urgency:\s*[^\]]+\]/gi, '').trim();
    }

    // 2. If dropoff was not in request_reason, evaluate rawDropOff
    if (!dropoff) {
        if (rawDropOff && typeof rawDropOff === 'string') {
            const isHex = /^01010000[0-9a-fA-F]+/i.test(rawDropOff.trim());
            const isPointWkt = /POINT\s*\(/i.test(rawDropOff.trim());
            const isGeneric = rawDropOff.trim().toLowerCase() === 'coordinate' || rawDropOff.trim().toLowerCase() === 'point';

            if (!isHex && !isPointWkt && !isGeneric && rawDropOff.trim().length > 3) {
                dropoff = rawDropOff.trim();
            }
        }
    }

    // 3. Fallback to descriptive municipality drop-off point if still empty or was hex
    if (!dropoff) {
        if (muniName && muniName.trim() && !muniName.includes('Coordinate')) {
            dropoff = `Designated EOC / Drop-off Point, ${muniName.trim()}`;
        } else {
            dropoff = 'Designated LGU Emergency Operations Center (EOC)';
        }
    }

    // 4. Clean empty notes fallback
    if (!cleanNotes || cleanNotes === 'HIGH Urgency Request' || cleanNotes === 'MEDIUM Urgency Request' || cleanNotes === 'LOW Urgency Request') {
        cleanNotes = 'Standard emergency logistics and resource replenishment request.';
    }

    return { dropoff, cleanNotes, urgency };
}

/**
 * Formats a date string into readable "Month Day, Year" (e.g. "October 10, 2026")
 */
export function formatReadableDate(dateStr?: string | null): string {
    if (!dateStr || dateStr === 'NO_RETURN' || dateStr.toLowerCase() === 'null') {
        return 'No Return Required';
    }
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

/**
 * Formats a date string with time (e.g. "Oct 10, 2026 at 2:30 PM")
 */
export function formatReadableDateTime(dateStr?: string | null): string {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return (
            d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }) +
            ' at ' +
            d.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            })
        );
    } catch {
        return dateStr;
    }
}

/**
 * Calculates Return Status and styling based on Expected Return Date, Returned Date, and Status
 */
export function computeReturnStatus(
    expectedReturnDate?: string | null,
    returnedAt?: string | null,
    currentStatus?: string | null
): ReturnStatusInfo {
    const isReturned =
        !!returnedAt ||
        (currentStatus && currentStatus.toLowerCase() === 'returned') ||
        (currentStatus && currentStatus.toLowerCase() === 'completed_returned');

    const expectedDateFormatted = formatReadableDate(expectedReturnDate);
    const actualDateFormatted = returnedAt ? formatReadableDate(returnedAt) : undefined;

    // Case 1: Already returned
    if (isReturned) {
        return {
            status: 'Returned',
            label: 'Returned',
            isOverdue: false,
            bgColor: '#ECFDF5',
            textColor: '#059669',
            borderColor: '#A7F3D0',
            expectedDateFormatted,
            actualDateFormatted,
        };
    }

    // Case 2: No return required
    if (
        !expectedReturnDate ||
        expectedReturnDate === 'NO_RETURN' ||
        expectedReturnDate.toLowerCase() === 'none' ||
        expectedReturnDate.toLowerCase() === 'no return required'
    ) {
        return {
            status: 'No Return Required',
            label: 'No Return Required',
            isOverdue: false,
            bgColor: '#F1F5F9',
            textColor: '#64748B',
            borderColor: '#CBD5E1',
            expectedDateFormatted: 'No Return Required',
        };
    }

    // Case 3: Check overdue vs pending return
    try {
        const expDate = new Date(expectedReturnDate);
        if (!isNaN(expDate.getTime())) {
            const now = new Date();
            // Compare by end of expected day (23:59:59)
            const expEndOfDay = new Date(expDate);
            expEndOfDay.setHours(23, 59, 59, 999);

            if (now.getTime() > expEndOfDay.getTime()) {
                return {
                    status: 'Overdue',
                    label: 'Overdue',
                    isOverdue: true,
                    bgColor: '#FEF2F2',
                    textColor: '#DC2626',
                    borderColor: '#FECACA',
                    expectedDateFormatted,
                };
            }
        }
    } catch (e) {
        console.warn('Error comparing return dates', e);
    }

    // Default Case: Pending Return
    return {
        status: 'Pending Return',
        label: 'Pending Return',
        isOverdue: false,
        bgColor: '#EFF6FF',
        textColor: '#2563EB',
        borderColor: '#BFDBFE',
        expectedDateFormatted,
    };
}

/**
 * Computes current Delivery Status
 */
export function computeDeliveryStatus(
    requestStatus?: string | null,
    allocations?: any[]
): DeliveryStatusType {
    const raw = (requestStatus || '').toLowerCase();

    if (raw === 'received' || raw === 'returned' || raw === 'closed' || raw === 'completed') {
        return 'Received';
    }

    if (raw === 'delivered') {
        return 'Delivered';
    }

    // Check allocations if available
    if (allocations && allocations.length > 0) {
        const allReceived = allocations.every(a => !!a.received_at);
        if (allReceived) return 'Received';

        const anyDelivered = allocations.some(a => !!a.delivered_at && !a.received_at);
        if (anyDelivered) return 'Delivered';

        const anyDispatched = allocations.some(a => !!a.dispatched_at && !a.delivered_at);
        if (anyDispatched) return 'In Transit';
    }

    if (raw === 'dispatched' || raw === 'in transit' || raw === 'in_progress') {
        return 'In Transit';
    }

    return 'Pending Delivery';
}

/**
 * Checks if "Mark as Received" button should be ENABLED.
 * ENABLED when items have been dispatched (In Transit) or delivered.
 * Matches the web workflow: Dispatched → Received → Returned (no separate Delivered step).
 * Remains DISABLED if still pending, or already received/returned/closed.
 */
export function isMarkAsReceivedEnabled(
    deliveryStatus: DeliveryStatusType,
    requestStatus?: string | null
): boolean {
    const raw = (requestStatus || '').toLowerCase();
    if (raw === 'received' || raw === 'returned' || raw === 'closed' || raw === 'completed') {
        return false; // Already received or beyond
    }
    return deliveryStatus === 'In Transit' || deliveryStatus === 'Delivered' || raw === 'dispatched' || raw === 'in_progress' || raw === 'delivered';
}

/**
 * Formats a payload to store in request_reason that preserves Drop-off Point and user notes
 */
export function buildRequestReason(dropoff: string, notes: string, urgency: string): string {
    const cleanDrop = dropoff.trim();
    const cleanNotes = notes.trim();
    const cleanUrg = urgency.trim().toUpperCase();

    if (cleanNotes) {
        return `[Drop-off: ${cleanDrop}]\n[Urgency: ${cleanUrg}]\n${cleanNotes}`;
    }
    return `[Drop-off: ${cleanDrop}]\n[Urgency: ${cleanUrg}]\n${cleanUrg} Urgency Request`;
}
