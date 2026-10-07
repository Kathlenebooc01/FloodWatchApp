import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SituationalReport, linkedReportId, readableReportText, reportContext, situationalStatus, situationalTitle } from '@/utils/situational-report';
import { supabase } from '@/utils/supabase';
import { ActiveReportTree } from '@/components/active-report-tree';

type Props = {
    visible: boolean;
    reports: SituationalReport[];
    selectedId: string | null;
    linkCounts: Record<string, number>;
    loading: boolean;
    error: string;
    onClose: () => void;
    onLink: (id: string) => void;
    onRetry: () => void;
};

export const situationalReference = (id: string) => `SIT-${id.slice(0, 8).toUpperCase()}`;
const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function StatusBadge({ status }: { status: string | null }) {
    const text = readableReportText(status || 'Pending');
    const done = /resolved|closed|completed/i.test(text);
    return <View style={[s.badge, done && { backgroundColor: '#DCFCE7' }]}><Text style={[s.badgeText, done && { color: '#166534' }]}>{text}</Text></View>;
}

export function SituationalReportLinker({ visible, reports, selectedId, linkCounts, loading, error, onClose, onLink, onRetry }: Props) {
    const [search, setSearch] = useState('');
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [attachmentError, setAttachmentError] = useState('');
    const [treeOpen, setTreeOpen] = useState(false);
    const [treePreview, setTreePreview] = useState<{ report: SituationalReport; rootId: string; count: number } | null>(null);
    const preview = treePreview?.report.report_id === previewId ? treePreview.report : reports.find(report => report.report_id === previewId);
    const familyId = treePreview?.report.report_id === previewId ? treePreview.rootId : preview?.parent_report_id || preview?.report_id;
    const familyCount = familyId && linkCounts[familyId] != null ? linkCounts[familyId] : treePreview?.count || 0;
    const matches = reports.filter(report => [report.hazard_type, 'Situational Report', report.report_id, report.description, report.place?.name, report.municipality?.name].some(value => readableReportText(value).toLowerCase().includes(search.trim().toLowerCase())));
    const documentName = preview?.description?.match(/\[Attached Document: (.+?)\]/)?.[1];
    const previewAttachment = async (path: string) => {
        setAttachmentError('');
        try {
            const { data } = supabase.storage.from('incident-reports').getPublicUrl(path);
            await Linking.openURL(data.publicUrl);
        } catch { setAttachmentError('Unable to open this attachment. Please try again.'); }
    };

    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={s.overlay}>
            <SafeAreaView edges={['bottom']} style={s.sheet}>
                <View style={s.handle} />
                <View style={s.header}>
                    {previewId && <TouchableOpacity accessibilityLabel="Back to List" style={s.iconButton} onPress={() => setPreviewId(null)}><Ionicons name="arrow-back" size={22} color="#64748B" /></TouchableOpacity>}
                    <View style={{ flex: 1 }}>
                        <Text style={s.heading}>{previewId ? 'Report Details Preview' : 'Link to Existing Report'}</Text>
                        <Text style={s.subtitle}>{preview ? `${situationalReference(preview.report_id)}  |  ${'LGU Situational Report'}` : 'Select an LGU situational report to link this update under.'}</Text>
                    </View>
                    <TouchableOpacity accessibilityLabel="Close report picker" style={s.iconButton} onPress={onClose}><Ionicons name="close" size={22} color="#64748B" /></TouchableOpacity>
                </View>
                {!!error && <View style={s.notice}><Text style={s.error}>{error}</Text><TouchableOpacity onPress={onRetry}><Text style={s.actionText}>Try again</Text></TouchableOpacity></View>}
                {loading ? <View style={s.empty}><ActivityIndicator color="#0954E8" /><Text style={s.subtitle}>Loading LGU situational reports...</Text></View> : previewId ? preview ? <>
                    <ScrollView contentContainerStyle={s.content}>
                        <View style={s.notice}><Ionicons name="information-circle-outline" size={23} color="#0954E8" /><Text style={s.noticeText}>Review the report details before linking your situational update to this LGU situational report.</Text></View>
                        <View style={s.detailCard}>
                            <View style={s.row}><Text style={s.reference}>{situationalReference(preview.report_id)}</Text><StatusBadge status={situationalStatus(preview)} /></View>
                            <Text style={s.reportTitle}>{situationalTitle(preview.hazard_type)}</Text>
                            <Text style={s.label}>REPORTED BY LGU</Text>
                            <View style={s.row}><Ionicons name="person-outline" size={22} color="#0954E8" /><Text style={s.value}>{readableReportText(preview.reporter?.full_name || 'LGU Officer')}  |  {'LGU Situational Report'}</Text></View>
                            <Text style={s.subtitle}>{readableReportText(preview.reporter?.organization_name || '')}</Text>
                            {!!preview.status && <Text style={s.subtitle}>Review status: {readableReportText(preview.status)}</Text>}
                            {!!linkedReportId(preview.description) && <Text style={s.subtitle}>Parent report: {situationalReference(linkedReportId(preview.description)!)}</Text>}
                            <Text style={s.label}>LOCATION</Text>
                            <View style={s.location}><Ionicons name="location-outline" size={24} color="#0954E8" /><View style={{ flex: 1 }}><Text style={s.value}>{readableReportText([preview.place?.name, preview.municipality?.name].filter(Boolean).join(', ') || preview.description?.match(/Location:\s*(.+)/i)?.[1] || preview.description?.match(/from\s+(.+)/i)?.[1] || 'Location not provided')}</Text>{preview.latitude != null && preview.longitude != null && <Text style={s.subtitle}>{preview.latitude.toFixed(5)}, {preview.longitude.toFixed(5)}</Text>}</View></View>
                            <Text style={s.subtitle}>Submitted {dateLabel(preview.created_at)}</Text>
                        </View>
                        <Text style={s.sectionHeading}>DETAILED CONTEXT & OBSERVATIONS</Text>
                        <View style={s.detailCard}><Text style={s.context}>{reportContext(preview.description) || 'No additional description provided.'}</Text></View>
                        <Text style={s.sectionHeading}>LINKED UPDATES & ATTACHMENTS</Text>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Active Report Tree" style={[s.detailCard, s.row]} onPress={() => setTreeOpen(true)}><Ionicons name="git-network-outline" size={24} color="#0954E8" /><View style={{ flex: 1 }}><Text style={s.value}>{familyCount} Situational Reports Linked</Text><Text style={s.subtitle}>Updates associated with this situational report</Text></View><View style={s.treeBadge}><Text style={s.treeBadgeText}>ACTIVE TREE</Text></View></TouchableOpacity>
                        {preview.image_url && <TouchableOpacity accessibilityLabel="Preview report image" onPress={() => { void Linking.openURL(preview.image_url!).catch(() => setAttachmentError('Unable to open this image.')); }}><Image source={{ uri: preview.image_url }} resizeMode="contain" style={s.image} /><Text style={s.actionText}>Preview attachment</Text></TouchableOpacity>}
                        {documentName && <View style={[s.detailCard, s.row]}><Ionicons name="document-text-outline" size={24} color="#DC2626" /><Text style={[s.value, { flex: 1 }]}>{readableReportText(documentName)}</Text><TouchableOpacity onPress={() => { void previewAttachment(documentName); }}><Text style={s.actionText}>Preview</Text></TouchableOpacity></View>}
                        {!preview.image_url && !documentName && <Text style={s.subtitle}>No attachments provided.</Text>}
                        {!!attachmentError && <Text style={s.error}>{attachmentError}</Text>}
                    </ScrollView>
                    <View style={s.footer}>
                        <TouchableOpacity style={s.secondaryButton} onPress={() => setPreviewId(null)}><Ionicons name="arrow-back" size={18} color="#0F172A" /><Text style={s.secondaryText}>Back to List</Text></TouchableOpacity>
                        <TouchableOpacity style={s.primaryButton} onPress={() => { onLink(familyId || preview.report_id); setPreviewId(null); }}><Ionicons name="link-outline" size={18} color="#FFF" /><Text style={s.primaryText}>Link This Report</Text></TouchableOpacity>
                    </View>
                </> : <View style={s.empty}><Text style={s.value}>This report is no longer available.</Text><TouchableOpacity style={s.secondaryButton} onPress={() => setPreviewId(null)}><Text style={s.secondaryText}>Back to List</Text></TouchableOpacity></View> : <>
                    <View style={s.search}><Ionicons name="search" size={18} color="#64748B" /><TextInput accessibilityLabel="Search LGU situational reports" style={s.searchInput} placeholder="Search reports..." placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} /></View>
                    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
                        <Text style={s.sectionHeading}>LGU SITUATIONAL REPORTS</Text>
                        {matches.map(report => {
                            const checked = report.report_id === selectedId;
                            return <TouchableOpacity key={report.report_id} accessibilityRole="button" accessibilityLabel={`Preview ${situationalTitle(report.hazard_type)}${checked ? ', linked' : ''}`} style={[s.listCard, checked && s.checkedCard]} onPress={() => { setAttachmentError(''); setTreePreview(null); setPreviewId(report.report_id); }}>
                                <View style={s.reportIcon}><Ionicons name="clipboard-outline" size={21} color="#0954E8" /></View>
                                <View style={{ flex: 1 }}><Text style={s.listTitle}>{situationalTitle(report.hazard_type)}</Text><Text style={s.subtitle}>{'Situational Report'}  |  {dateLabel(report.created_at)}</Text><View style={[s.row, { marginTop: 5 }]}><StatusBadge status={situationalStatus(report)} /><Text style={s.small}>{linkCounts[report.report_id] || 0} linked updates</Text></View></View>
                                <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={checked ? '#0954E8' : '#CBD5E1'} />
                            </TouchableOpacity>;
                        })}
                        {!matches.length && !error && <View style={s.empty}><Ionicons name="documents-outline" size={32} color="#94A3B8" /><Text style={s.value}>{search ? 'No matching reports' : 'No LGU situational reports yet'}</Text><Text style={s.subtitle}>New reports appear here automatically.</Text></View>}
                    </ScrollView>
                </>}
                {visible && treeOpen && previewId && <ActiveReportTree key={previewId} reportId={previewId} onClose={() => setTreeOpen(false)} onOpenReport={(report, rootId, count) => { setTreePreview({ report, rootId, count }); setPreviewId(report.report_id); setAttachmentError(''); setTreeOpen(false); }} />}
            </SafeAreaView>
        </View>
    </Modal>;
}

const s = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
    sheet: { maxHeight: '94%', minHeight: '55%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
    handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D7E1F3', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderColor: '#EDF0F5' },
    heading: { fontSize: 20, fontWeight: '800', color: '#151A23' },
    subtitle: { fontSize: 12, color: '#64748B', lineHeight: 18, marginTop: 4 },
    iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDF2FA', alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, gap: 14, paddingBottom: 26 },
    search: { margin: 20, marginBottom: 0, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#EDF0F5' },
    searchInput: { flex: 1, height: 44, color: '#0F172A' },
    sectionHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#64748B', marginTop: 5 },
    listCard: { flexDirection: 'row', gap: 12, padding: 14, borderWidth: 1, borderColor: '#E3E8F0', borderRadius: 16, alignItems: 'flex-start' },
    checkedCard: { borderColor: '#0954E8', backgroundColor: '#F3F6FF' },
    reportIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center' },
    listTitle: { fontSize: 14, fontWeight: '700', color: '#151A23' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    badge: { alignSelf: 'flex-start', backgroundColor: '#FFF3C4', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
    badgeText: { color: '#92400E', fontSize: 10, fontWeight: '700' },
    small: { color: '#64748B', fontSize: 10 },
    notice: { margin: 0, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#C9D9FE', backgroundColor: '#F3F6FF', flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    noticeText: { flex: 1, fontSize: 14, color: '#334155', lineHeight: 22 },
    detailCard: { backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#E8EBF0', borderRadius: 20, padding: 18, gap: 10 },
    treeBadge: { backgroundColor: '#DDE7FB', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5 },
    treeBadgeText: { color: '#0954E8', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    reference: { fontSize: 11, fontWeight: '800', color: '#0954E8', letterSpacing: 0.5 },
    reportTitle: { fontSize: 23, fontWeight: '800', color: '#151A23', lineHeight: 30 },
    label: { fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.8, marginTop: 12 },
    value: { fontSize: 14, fontWeight: '600', color: '#151A23', lineHeight: 21, flexShrink: 1 },
    location: { backgroundColor: '#FFF', borderRadius: 14, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
    context: { fontSize: 15, color: '#334155', lineHeight: 25 },
    image: { height: 220, width: '100%', borderRadius: 14, backgroundColor: '#F5F6F8' },
    actionText: { color: '#0954E8', fontSize: 13, fontWeight: '700', paddingVertical: 6 },
    error: { color: '#B91C1C', fontSize: 13, flexShrink: 1 },
    empty: { padding: 30, alignItems: 'center', gap: 12 },
    footer: { borderTopWidth: 1, borderColor: '#EDF0F5', padding: 16, flexDirection: 'row', gap: 10 },
    secondaryButton: { flex: 1, minHeight: 52, backgroundColor: '#EDF2FA', borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
    primaryButton: { flex: 1, minHeight: 52, backgroundColor: '#0954E8', borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
    secondaryText: { fontSize: 13, fontWeight: '700', color: '#151A23', flexShrink: 1 },
    primaryText: { fontSize: 13, fontWeight: '700', color: '#FFF', flexShrink: 1 },
});
