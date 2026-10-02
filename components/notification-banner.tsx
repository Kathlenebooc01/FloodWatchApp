import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Modal,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export interface BannerNotif {
    id: string;
    title: string;
    message: string;
    type: string;
}

type BannerListener = (notif: BannerNotif, force?: boolean) => void;
let globalBannerListener: BannerListener | null = null;
const pendingBannerQueue: { notif: BannerNotif; force?: boolean }[] = [];

/**
 * Manually trigger the heads-up notification banner from anywhere in the app
 */
export function triggerNotificationBanner(notif: BannerNotif, force: boolean = true) {
    if (globalBannerListener) {
        globalBannerListener(notif, force);
    } else {
        pendingBannerQueue.push({ notif, force });
    }
}

function getBannerStyle(title: string, type: string) {
    const t = (title || '').toLowerCase();

    if (t.includes('verified') || t.includes('complete') || t.includes('resolved') || t.includes('approved')) {
        return {
            accent:   '#10B981',
            iconBg:   '#D1FAE5',
            iconColor:'#059669',
            icon:     'checkmark-circle' as const,
            tag:      'VERIFIED',
            tagBg:    '#ECFDF5',
            tagColor: '#059669',
        };
    }
    if (t.includes('failed') || t.includes('rejected') || t.includes('declined') || t.includes('not accepted')) {
        return {
            accent:   '#EF4444',
            iconBg:   '#FEE2E2',
            iconColor:'#DC2626',
            icon:     'close-circle' as const,
            tag:      'DECLINED',
            tagBg:    '#FEF2F2',
            tagColor: '#DC2626',
        };
    }
    if (t.includes('ongoing') || t.includes('progress') || t.includes('pending') || t.includes('review')) {
        return {
            accent:   '#F59E0B',
            iconBg:   '#FEF3C7',
            iconColor:'#D97706',
            icon:     'time' as const,
            tag:      'IN PROGRESS',
            tagBg:    '#FFFBEB',
            tagColor: '#D97706',
        };
    }
    if (type === 'Emergency' || t.includes('evacuation') || t.includes('flood') || t.includes('urgent')) {
        return {
            accent:   '#EF4444',
            iconBg:   '#FEE2E2',
            iconColor:'#DC2626',
            icon:     'alert-circle' as const,
            tag:      'EMERGENCY',
            tagBg:    '#FEF2F2',
            tagColor: '#DC2626',
        };
    }
    return {
        accent:   '#2563EB',
        iconBg:   '#EFF6FF',
        iconColor:'#2563EB',
        icon:     'notifications' as const,
        tag:      'NOTIFICATION',
        tagBg:    '#EFF6FF',
        tagColor: '#2563EB',
    };
}

export default function NotificationBanner() {
    const router = useRouter();
    const [modalVisible, setModalVisible] = useState(false);
    const [banner, setBanner] = useState<BannerNotif | null>(null);
    const translateY = useRef(new Animated.Value(-300)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shownIds = useRef<Set<string>>(new Set());
    const userId = useRef<string | null>(null);
    const targetRole = useRef<string>('user');
    // Track the timestamp when we started watching — only pop banners NEWER than this
    const watchSince = useRef<string>(new Date().toISOString());
    const lastTitleTimes = useRef<{ [key: string]: number }>({});

    const hideBanner = useCallback(() => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
        Animated.timing(translateY, {
            toValue: -300,
            duration: 280,
            useNativeDriver: true,
        }).start(() => {
            setModalVisible(false);
            setBanner(null);
        });
    }, [translateY]);

    const showBanner = useCallback((notif: BannerNotif, force: boolean = false) => {
        if (!notif) return;
        if (!force && shownIds.current.has(notif.id)) return;

        // Deduplicate by normalized title within 12 seconds so multiple simultaneous triggers
        // (e.g. notifications insert + id_verification update + profiles update) only pop up once
        const normTitle = (notif.title || '').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim().toLowerCase();
        const now = Date.now();
        if (normTitle && lastTitleTimes.current[normTitle] && (now - lastTitleTimes.current[normTitle] < 12000)) {
            console.log('🔇 Suppressed duplicate banner for title:', normTitle);
            return;
        }
        if (normTitle) {
            lastTitleTimes.current[normTitle] = now;
        }

        shownIds.current.add(notif.id);

        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }

        setBanner(notif);
        translateY.setValue(-300);
        setModalVisible(true);
    }, [translateY]);

    // Animate in whenever banner is set
    useEffect(() => {
        if (!banner) return;

        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } catch (e) {}

        Animated.spring(translateY, {
            toValue: 0,
            tension: 85,
            friction: 9,
            useNativeDriver: true,
        }).start();

        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
            hideBanner();
        }, 7000);
    }, [banner]); // eslint-disable-line react-hooks/exhaustive-deps

    // Register global trigger listener & flush pending queue
    useEffect(() => {
        globalBannerListener = (notif: BannerNotif, force?: boolean) => {
            showBanner(notif, force ?? true);
        };
        // Flush any queued banners that came before component mounted
        while (pendingBannerQueue.length > 0) {
            const p = pendingBannerQueue.shift();
            if (p) showBanner(p.notif, p.force ?? true);
        }
        return () => {
            globalBannerListener = null;
        };
    }, [showBanner]);

    const handleVerificationStatusChange = useCallback((rawStatus: string, verId?: string) => {
        const s = (rawStatus || '').toLowerCase().trim();
        // Use a stable key so same status+verId never pops twice
        const bannerKey = `ver_${verId || 'curr'}_${s}`;
        if (shownIds.current.has(bannerKey)) return; // deduplicated
        shownIds.current.add(bannerKey);

        if (s === 'approved' || s === 'verified') {
            showBanner({
                id: bannerKey,
                title: '\u2705 ID Verification Complete',
                message: 'Your identity has been successfully verified. You can now submit flood incident reports.',
                type: 'Updates',
            });
        } else if (s === 'rejected' || s === 'declined' || s === 'failed') {
            showBanner({
                id: bannerKey,
                title: '\u274c ID Verification Failed',
                message: 'Your ID could not be verified. Please make sure your ID photo is clear and try again.',
                type: 'Updates',
            });
        }
        // Note: 'pending' is shown via triggerNotificationBanner in identify.tsx only — not repeated here
    }, [showBanner]);

    // Fallback poll: ONLY fires for notifications created after this session started.
    // Realtime handles instant delivery; poll is just a safety net for missed websocket events.
    const poll = useCallback(async () => {
        const uid = userId.current;
        if (!uid) return;

        try {
            const { data: notifs } = await supabase
                .from('notifications')
                .select('id, title, message, type, user_id, target_role')
                .or(`user_id.eq.${uid},and(target_role.eq.user,user_id.is.null)`)
                .gte('created_at', watchSince.current) // ONLY new ones since mount
                .order('created_at', { ascending: false })
                .limit(5);

            if (notifs) {
                for (const row of notifs) {
                    if (!shownIds.current.has(row.id)) {
                        showBanner({
                            id: row.id,
                            title: row.title || 'New Notification',
                            message: row.message || '',
                            type: row.type || 'Updates',
                        });
                        break; // only show one at a time
                    }
                }
            }
        } catch (e) {
            // silent
        }
    }, [showBanner]);

    useEffect(() => {
        let channel: any = null;
        let verifyChannel: any = null;
        let profileChannel: any = null;
        let incidentChannel: any = null;
        let lguChannel: any = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        let incidentPoll: ReturnType<typeof setInterval> | null = null;
        let logisticsPoll: ReturnType<typeof setInterval> | null = null;

        const cleanupSubs = () => {
            if (channel) { supabase.removeChannel(channel); channel = null; }
            if (verifyChannel) { supabase.removeChannel(verifyChannel); verifyChannel = null; }
            if (profileChannel) { supabase.removeChannel(profileChannel); profileChannel = null; }
            if (incidentChannel) { supabase.removeChannel(incidentChannel); incidentChannel = null; }
            if (lguChannel) { supabase.removeChannel(lguChannel); lguChannel = null; }
            if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
            if (incidentPoll) { clearInterval(incidentPoll); incidentPoll = null; }
            if (logisticsPoll) { clearInterval(logisticsPoll); logisticsPoll = null; }
        };

        const syncIncidentReports = async (uid: string) => {
            try {
                const { data: reports } = await supabase
                    .from('incident_report')
                    .select('report_id, status, report_type, hazard_type, title, created_at')
                    .eq('user_id', uid)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (!reports) return;

                const stored = await AsyncStorage.getItem(`incident_state_${uid}`);
                const prevState: Record<string, string> = stored ? JSON.parse(stored) : {};
                const newState: Record<string, string> = {};

                for (const rep of reports) {
                    const statusStr = (rep.status || '').toLowerCase();
                    newState[rep.report_id] = statusStr;
                    const oldState = prevState[rep.report_id];
                    const isRecent = (Date.now() - new Date(rep.created_at).getTime()) < 48 * 60 * 60 * 1000;

                    if (oldState && oldState !== statusStr && isRecent) {
                        const isEsc = (rep.hazard_type || '').toLowerCase().includes('escalation') ||
                                      (rep.title || '').toLowerCase().includes('escalation');
                        const isSit = rep.report_type === 'situational';

                        if (statusStr === 'accepted' || statusStr === 'verified') {
                            showBanner({
                                id: `inc-${rep.report_id}-${Date.now()}`,
                                title: isEsc ? 'Provincial Support Confirmed ✅' : isSit ? 'Situational Report Accepted ✅' : 'Report Verified ✅',
                                message: isEsc
                                    ? 'Your provincial assistance request has been confirmed and mobilized by PDRRMO.'
                                    : 'Your situational report has been verified and accepted by the PDRRMO.',
                                type: 'Updates',
                            }, true);
                        } else if (statusStr === 'rejected' || statusStr === 'declined') {
                            showBanner({
                                id: `inc-${rep.report_id}-${Date.now()}`,
                                title: isEsc ? 'Provincial Support Declined' : 'Report Declined',
                                message: 'Your report was reviewed by PDRRMO but could not be accepted at this time.',
                                type: 'Updates',
                            }, true);
                        }
                    }
                }
                await AsyncStorage.setItem(`incident_state_${uid}`, JSON.stringify(newState));
            } catch (e) {}
        };

        const syncLogisticsRequests = async (uid: string) => {
            try {
                const { data: requests } = await supabase
                    .from('resource_requests')
                    .select('request_id, status, created_at')
                    .eq('requested_by', uid);

                if (!requests) return;

                const stored = await AsyncStorage.getItem(`logistics_state_${uid}`);
                const prevState: Record<string, string> = stored ? JSON.parse(stored) : {};
                const newState: Record<string, string> = {};

                for (const req of requests) {
                    const stateString = req.status || '';
                    newState[req.request_id] = stateString;
                    const oldState = prevState[req.request_id];
                    const isRecent = (Date.now() - new Date(req.created_at).getTime()) < 24 * 60 * 60 * 1000;

                    if (oldState !== stateString && (oldState || (isRecent && stateString !== 'Pending'))) {
                        if (['Approved', 'Fully_Allocated', 'Dispatched', 'Transit', 'Completed'].includes(stateString)) {
                            let title = 'Request Approved';
                            let message = 'Your request has been approved by PDRRMO.';
                            if (stateString === 'Dispatched') {
                                title = 'Items Dispatched 🚛';
                                message = 'Your requested logistics have been dispatched by the PDRRMO!';
                            } else if (stateString === 'Transit') {
                                title = 'Items In Transit';
                                message = 'Your requested logistics are currently in transit to your location.';
                            } else if (stateString === 'Completed') {
                                title = 'Request Completed ✅';
                                message = 'Your returned items have been officially received by PDRRMO.';
                            }

                            showBanner({
                                id: `req-${req.request_id}-${Date.now()}`,
                                title,
                                message,
                                type: 'Updates',
                            }, true);
                        }
                    }
                }
                await AsyncStorage.setItem(`logistics_state_${uid}`, JSON.stringify(newState));
            } catch (e) {}
        };

        let isInitializing = false;

        const initForUser = async (uid: string) => {
            // Prevent concurrent initializations that cause channel double-subscribe errors
            if (isInitializing) return;
            isInitializing = true;
            cleanupSubs();
            userId.current = uid;

            // Unique suffix prevents Supabase from reusing a stale channel with the same name
            const ts = Date.now();

            try {
                // Set watchSince to now so poll only picks up NEW notifications from this point
                watchSince.current = new Date().toISOString();

                // Preload ALL existing notification IDs so they never pop as banners
                const { data: existing } = await supabase
                    .from('notifications')
                    .select('id')
                    .or(`user_id.eq.${uid},and(target_role.eq.user,user_id.is.null)`)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (existing) existing.forEach(r => shownIds.current.add(r.id));

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', uid)
                    .single();
                if (profile) {
                    if (['lgu', 'lgu_headmaster', 'admin'].includes(profile.role)) {
                        targetRole.current = 'lgu';
                    } else {
                        targetRole.current = 'user';
                    }
                }
            } catch (e) {}

            // If user changed while we were awaiting, bail out — cleanupSubs was already called
            if (userId.current !== uid) {
                isInitializing = false;
                return;
            }

            // === Real-time: notifications table ===
            channel = supabase
                .channel(`banner-notifs-${uid}-${ts}`)
                .on('postgres_changes' as any, {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                }, (payload: any) => {
                    const row = payload.new;
                    if (!row) return;
                    const isForMe = row.user_id === uid ||
                        (!row.user_id && (row.target_role === targetRole.current || row.target_role === 'user'));
                    if (isForMe) {
                        // showBanner uses shownIds dedup — won't repeat
                        showBanner({
                            id: row.id || `notif-rt-${Date.now()}`,
                            title: row.title || 'New Notification',
                            message: row.message || '',
                            type: row.type || 'Updates',
                        });
                    }
                })
                .subscribe();

            // === Real-time: id_verification ===
            verifyChannel = supabase
                .channel(`banner-verify-${uid}-${ts}`)
                .on('postgres_changes' as any, {
                    event: '*',
                    schema: 'public',
                    table: 'id_verification',
                }, (payload: any) => {
                    const row = payload.new;
                    if (row && row.user_id === uid) {
                        handleVerificationStatusChange(row.status, row.id_verification_id);
                    }
                })
                .subscribe();

            // === Real-time: profiles — deduped via shownIds ===
            profileChannel = supabase
                .channel(`banner-profiles-${uid}-${ts}`)
                .on('postgres_changes' as any, {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                }, (payload: any) => {
                    const row = payload.new;
                    if (row && row.id === uid && row.is_verified === true) {
                        const key = `profile-verified-${uid}`;
                        if (!shownIds.current.has(key)) {
                            shownIds.current.add(key);
                            showBanner({
                                id: key,
                                title: '\u2705 ID Verification Complete',
                                message: 'Your identity has been successfully verified. You can now submit flood incident reports.',
                                type: 'Updates',
                            });
                        }
                    }
                })
                .subscribe();

            // === Real-time: incident_report ===
            incidentChannel = supabase
                .channel(`banner-incidents-${uid}-${ts}`)
                .on('postgres_changes' as any, {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'incident_report',
                    filter: `user_id=eq.${uid}`,
                }, () => {
                    syncIncidentReports(uid);
                })
                .subscribe();

            syncIncidentReports(uid);
            incidentPoll = setInterval(() => syncIncidentReports(uid), 8000);

            if (targetRole.current === 'lgu') {
                syncLogisticsRequests(uid);
                logisticsPoll = setInterval(() => syncLogisticsRequests(uid), 10000);
                lguChannel = supabase.channel(`banner-lgu-${uid}-${ts}`)
                    .on('postgres_changes' as any, {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'resource_requests',
                        filter: `requested_by=eq.${uid}`,
                    }, () => { syncLogisticsRequests(uid); })
                    .subscribe();
            }

            // Fallback poll every 15s (realtime handles instant delivery)
            poll();
            pollInterval = setInterval(poll, 15000);
            isInitializing = false;
        };

        const setup = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const uid = sessionData?.session?.user?.id;
            if (uid) initForUser(uid);
        };

        const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
            const uid = session?.user?.id;
            if (uid && uid !== userId.current) initForUser(uid);
        });

        setup();

        return () => {
            authSub?.subscription?.unsubscribe();
            cleanupSubs();
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, [showBanner, poll, handleVerificationStatusChange]);

    const style = getBannerStyle(banner?.title || '', banner?.type || '');
    const TOP = Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 24) + 10;

    return (
        <Modal
            visible={modalVisible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={hideBanner}
        >
            <View style={styles.overlay} pointerEvents="box-none">
                <Animated.View
                    style={[
                        styles.container,
                        { top: TOP, transform: [{ translateY }] },
                    ]}
                    pointerEvents="box-none"
                >
                    {banner && (
                        <TouchableOpacity
                            style={[styles.card, { borderLeftColor: style.accent }]}
                            activeOpacity={0.95}
                            onPress={() => {
                                hideBanner();
                                router.push('/notifications' as any);
                            }}
                        >
                            <View style={[styles.iconCircle, { backgroundColor: style.iconBg }]}>
                                <Ionicons name={style.icon as any} size={26} color={style.iconColor} />
                            </View>

                            <View style={styles.textArea}>
                                <View style={[styles.tagPill, { backgroundColor: style.tagBg }]}>
                                    <Text style={[styles.tagText, { color: style.tagColor }]}>{style.tag}</Text>
                                </View>
                                <Text style={styles.title} numberOfLines={1}>{banner.title}</Text>
                                <Text style={styles.message} numberOfLines={2}>{banner.message}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.closeBtn}
                                onPress={hideBanner}
                                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                            >
                                <Ionicons name="close" size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    container: {
        position: 'absolute',
        left: 12,
        right: 12,
    },
    card: {
        flexDirection:    'row',
        alignItems:       'center',
        backgroundColor:  '#FFFFFF',
        borderRadius:     20,
        padding:          14,
        shadowColor:      '#000',
        shadowOffset:     { width: 0, height: 8 },
        shadowOpacity:    0.20,
        shadowRadius:     20,
        elevation:        30,
        borderWidth:      1,
        borderColor:      '#E2E8F0',
        borderLeftWidth:  5,
    },
    iconCircle: {
        width:          48,
        height:         48,
        borderRadius:   24,
        justifyContent: 'center',
        alignItems:     'center',
        marginRight:    12,
        flexShrink:     0,
    },
    textArea: {
        flex: 1,
        justifyContent: 'center',
    },
    tagPill: {
        alignSelf:         'flex-start',
        paddingHorizontal: 8,
        paddingVertical:   2,
        borderRadius:      6,
        marginBottom:      3,
    },
    tagText: {
        fontSize:      9,
        fontWeight:    '700',
        letterSpacing: 0.8,
    },
    title: {
        fontSize:   14,
        fontWeight: '700',
        color:      '#0F172A',
        lineHeight: 18,
    },
    message: {
        fontSize:   12,
        color:      '#475569',
        marginTop:  2,
        lineHeight: 16,
    },
    closeBtn: {
        padding:    6,
        marginLeft: 8,
        flexShrink: 0,
    },
});
