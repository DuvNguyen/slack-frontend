'use client';

import { ChangeEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { clearTokens, getRefreshToken } from '@/lib/auth';
import { ModalShell } from '@/components/modal-shell';

type Channel = { id: string; name: string; workspace_id: string; is_private?: boolean };
type Member = {
  user_id: string;
  role: string;
  name?: string | null;
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  status_text?: string | null;
  phone?: string | null;
};
type Conv = { id: string; workspace_id: string; peer_user_id: string | null };
type Msg = { id: string; user_id: string; content: string; created_at: string };
type Me = {
  id: string;
  email: string;
  name?: string | null;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  status_text?: string | null;
  phone?: string | null;
};
type Tab = 'about' | 'members';

const THEME_KEY = 'slack_mvp_chat_theme';
const STARRED_CHANNELS_KEY_PREFIX = 'slack_mvp_starred_channels';

function ChatPageClient() {
  const router = useRouter();
  const search = useSearchParams();
  const workspaceId = search.get('workspaceId') ?? '';

  const [me, setMe] = useState<Me | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [channelMembers, setChannelMembers] = useState<Member[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [selectedConv, setSelectedConv] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [createChannelStep, setCreateChannelStep] = useState<1 | 2>(1);
  const [createIsPrivate, setCreateIsPrivate] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [inviteAfterCreateModalOpen, setInviteAfterCreateModalOpen] = useState(false);
  const [inviteChannel, setInviteChannel] = useState<Channel | null>(null);
  const [inviteInput, setInviteInput] = useState('');
  const [invitingMembers, setInvitingMembers] = useState(false);

  const [inviteTeammatesModalOpen, setInviteTeammatesModalOpen] = useState(false);
  const [inviteTeammatesInput, setInviteTeammatesInput] = useState('');
  const [invitingTeammates, setInvitingTeammates] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('about');
  const [editingName, setEditingName] = useState('');
  const [isEditingAbout, setIsEditingAbout] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Member | null>(null);

  const [darkMode, setDarkMode] = useState(() => (typeof window !== 'undefined' && localStorage.getItem(THEME_KEY) === 'dark'));

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditContact, setShowEditContact] = useState(false);
  const [showEditStatus, setShowEditStatus] = useState(false);

  const [profileForm, setProfileForm] = useState({ fullName: '', displayName: '' });
  const [contactForm, setContactForm] = useState({ email: '', phone: '' });
  const [statusForm, setStatusForm] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [starredChannelIds, setStarredChannelIds] = useState<string[]>([]);

  const editAvatarInputRef = useRef<HTMLInputElement | null>(null);

  const scope = useMemo(() => (selectedConv ? 'dm' : 'channel'), [selectedConv]);
  const currentChannel = useMemo(() => channels.find((c) => c.id === selectedChannel) ?? null, [channels, selectedChannel]);

  const profileMap = useMemo(() => {
    const map = new Map<string, Member>();
    [...members, ...channelMembers].forEach((m) => map.set(m.user_id, m));
    if (me) {
      map.set(me.id, {
        user_id: me.id,
        role: 'MEMBER',
        name: me.name,
        display_name: me.display_name,
        username: me.username,
        email: me.email,
        avatar_url: me.avatar_url,
        status_text: me.status_text,
        phone: me.phone,
      });
    }
    return map;
  }, [members, channelMembers, me]);

  const selectedConversation = useMemo(() => convs.find((c) => c.id === selectedConv) ?? null, [convs, selectedConv]);
  const isSelfConversation = Boolean(selectedConversation && me && selectedConversation.peer_user_id === me.id);

  const starredChannels = useMemo(
    () => starredChannelIds.map((id) => channels.find((ch) => ch.id === id)).filter((ch): ch is Channel => Boolean(ch)),
    [starredChannelIds, channels],
  );

  function starredKey() {
    return `${STARRED_CHANNELS_KEY_PREFIX}:${workspaceId}`;
  }

  function getMemberName(member?: Partial<Member> | null) {
    return member?.display_name ?? member?.name ?? member?.username ?? 'Unknown';
  }

  async function loadAll() {
    if (!workspaceId) return;
    try {
      const [meRes, ch, mem, dm, profile] = await Promise.all([
        apiCall<{ ok: boolean; user: Me }>('/api/identity/secure/users/me', { method: 'GET' }, true),
        apiCall<{ ok: boolean; channels: Channel[] }>(`/api/ws/workspaces/${workspaceId}/sidebar/channels`, { method: 'GET' }, true),
        apiCall<{ ok: boolean; members: Member[] }>(`/api/ws/workspaces/${workspaceId}/members`, { method: 'GET' }, true),
        apiCall<{ ok: boolean; conversations: Conv[] }>(`/api/chat/conversations/direct/${workspaceId}`, { method: 'GET' }, true),
        apiCall<{ ok: boolean; user: Me }>('/api/chat/profile/me', { method: 'GET' }, true),
      ]);

      const myProfile = profile.user ?? meRes.user;
      setMe(myProfile ?? null);
      setChannels(ch.channels ?? []);
      setMembers(mem.members ?? []);
      setConvs(dm.conversations ?? []);

      const rawStarred = localStorage.getItem(starredKey());
      if (!rawStarred) {
        setStarredChannelIds([]);
      } else {
        try {
          const parsed = JSON.parse(rawStarred) as string[];
          setStarredChannelIds(Array.isArray(parsed) ? parsed.slice(0, 5) : []);
        } catch {
          setStarredChannelIds([]);
        }
      }

      if (!selectedChannel && !selectedConv && ch.channels?.[0]?.id) setSelectedChannel(ch.channels[0].id);
      setProfileForm({ fullName: myProfile?.name ?? '', displayName: myProfile?.display_name ?? '' });
      setContactForm({ email: myProfile?.email ?? '', phone: myProfile?.phone ?? '' });
      setStatusForm(myProfile?.status_text ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      if (message.toLowerCase().includes('unauthorized') || message.includes('401')) {
        clearTokens();
        router.push('/auth?mode=signin');
        return;
      }
      throw error;
    }
  }

  async function loadMessages() {
    if (selectedConv) {
      const res = await apiCall<{ ok: boolean; messages: Msg[] }>(`/api/chat/messages/conversation/${selectedConv}`, { method: 'GET' }, true);
      setMessages(res.messages ?? []);
      return;
    }
    if (selectedChannel) {
      const res = await apiCall<{ ok: boolean; messages: Msg[] }>(`/api/chat/messages/channel/${selectedChannel}`, { method: 'GET' }, true);
      setMessages(res.messages ?? []);
      return;
    }
    setMessages([]);
  }

  async function loadChannelMembers() {
    if (!selectedChannel || !workspaceId) return;
    const res = await apiCall<{ ok: boolean; members: Member[] }>(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}/members`, { method: 'GET' }, true);
    setChannelMembers(res.members ?? []);
  }

  useEffect(() => {
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (!workspaceId) return;
    localStorage.setItem(starredKey(), JSON.stringify(starredChannelIds.slice(0, 5)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starredChannelIds, workspaceId]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadMessages(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel, selectedConv]);

  async function createChannel() {
    if (!newChannel.trim()) return;
    setCreatingChannel(true);
    try {
      const res = await apiCall<{ ok: boolean; channel: Channel }>(`/api/ws/channels/workspaces/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify({ name: newChannel.trim(), isPrivate: createIsPrivate }),
      }, true);

      const created = res.channel;
      setCreateChannelModalOpen(false);
      setCreateChannelStep(1);
      setInviteInput('');
      setInviteChannel(created);
      setInviteAfterCreateModalOpen(true);

      setNewChannel('');
      await loadAll();
      if (created?.id) {
        setSelectedConv('');
        setSelectedChannel(created.id);
      }
    } finally {
      setCreatingChannel(false);
    }
  }

  function parseInviteItems(raw: string) {
    return Array.from(new Set(raw.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)));
  }

  async function inviteMembersAfterCreate() {
    if (!inviteChannel || !inviteInput.trim()) return;
    const usernames = parseInviteItems(inviteInput);
    if (!usernames.length) return;
    setInvitingMembers(true);
    try {
      await apiCall(`/api/ws/channels/workspace/${workspaceId}/${inviteChannel.id}/invite-usernames`, {
        method: 'POST',
        body: JSON.stringify({ usernames }),
      }, true);
      setInviteInput('');
      setInviteAfterCreateModalOpen(false);
      setInviteChannel(null);
      await loadChannelMembers();
    } finally {
      setInvitingMembers(false);
    }
  }


  async function inviteWorkspaceTeammates() {
    if (!inviteTeammatesInput.trim() || !workspaceId) return;
    const emails = parseInviteItems(inviteTeammatesInput);
    if (!emails.length) return;

    setInvitingTeammates(true);
    try {
      await apiCall(`/api/ws/workspaces/${workspaceId}/invite-emails`, {
        method: 'POST',
        body: JSON.stringify({ emails }),
      }, true);
      setInviteTeammatesInput('');
      setInviteTeammatesModalOpen(false);
      await loadAll();
    } finally {
      setInvitingTeammates(false);
    }
  }

  async function openDm(peerUserId: string) {
    const res = await apiCall<{ ok: boolean; conversation: Conv }>(`/api/chat/conversations/direct`, {
      method: 'POST', body: JSON.stringify({ workspaceId, peerUserId }),
    }, true);
    setSelectedChannel('');
    setSelectedConv(res.conversation.id);
    await loadAll();
  }

  async function openSelfDm() {
    if (!me) return;
    const existing = convs.find((c) => c.peer_user_id === me.id);
    if (existing) {
      setSelectedChannel('');
      setSelectedConv(existing.id);
      return;
    }
    await openDm(me.id);
  }

  async function sendMessage() {
    if (!text.trim()) return;
    await apiCall('/api/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ content: text.trim(), channelId: selectedChannel || undefined, conversationId: selectedConv || undefined }),
    }, true);
    setText('');
    await loadMessages();
  }

  function toggleStarChannel(channelId: string) {
    setStarredChannelIds((prev) => {
      if (prev.includes(channelId)) return prev.filter((id) => id !== channelId);
      if (prev.length >= 5) {
        window.alert('You can star up to 5 channels.');
        return prev;
      }
      return [...prev, channelId];
    });
  }

  async function openChannelSettings() {
    if (!selectedChannel) return;
    setEditingName(currentChannel?.name ?? '');
    setIsEditingAbout(false);
    setTab('about');
    setModalOpen(true);
    await loadChannelMembers();
  }

  async function saveChannelName() {
    if (!selectedChannel) return;
    await apiCall(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: editingName.trim() }),
    }, true);
    await loadAll();
  }

  async function leaveChannel() {
    if (!selectedChannel) return;
    await apiCall(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}/leave`, { method: 'DELETE' }, true);
    setModalOpen(false);
    setSelectedChannel('');
    await loadAll();
  }

  async function kickMember(targetUserId: string) {
    if (!selectedChannel) return;
    await apiCall(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}/members/${targetUserId}`, { method: 'DELETE' }, true);
    await loadChannelMembers();
  }

  async function signOut() {
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await apiCall('/api/identity/secure/auth/signout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        }, true);
      }
    } catch {
      // ignore
    } finally {
      clearTokens();
      router.push('/auth?mode=signin');
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      if (avatarPreview && avatarPreview !== (me?.avatar_url ?? null)) {
        await apiCall('/api/chat/profile/me/avatar', {
          method: 'POST',
          body: JSON.stringify({ data_url: avatarPreview }),
        }, true);
      }
      await apiCall('/api/chat/profile/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileForm.fullName,
          display_name: profileForm.displayName,
        }),
      }, true);
      await loadAll();
      setShowEditProfile(false);
      setAvatarPreview(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save profile failed';
      window.alert(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveContact() {
    setSavingProfile(true);
    try {
      await apiCall('/api/chat/profile/me', {
        method: 'PATCH',
        body: JSON.stringify({ phone: contactForm.phone }),
      }, true);
      await loadAll();
      setShowEditContact(false);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveStatus() {
    setSavingProfile(true);
    try {
      await apiCall('/api/chat/profile/me/status', {
        method: 'POST',
        body: JSON.stringify({ status_text: statusForm }),
      }, true);
      await loadAll();
      setShowEditStatus(false);
    } finally {
      setSavingProfile(false);
    }
  }

  function onEditAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setAvatarPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  const activeProfile = selectedProfile ?? (me ? {
    user_id: me.id,
    role: 'MEMBER',
    name: me.name,
    display_name: me.display_name,
    username: me.username,
    email: me.email,
    avatar_url: me.avatar_url,
    status_text: me.status_text,
    phone: me.phone,
  } : null);

  return (
    <main className={`chat-shell h-screen w-full overflow-hidden ${darkMode ? 'app-dark' : ''}`}>
      <div className="grid h-full w-full grid-cols-[64px_290px_1fr]">
        <aside className="rail flex flex-col items-center border-r border-[var(--chat-border)] bg-[var(--chat-rail)] py-4">
          <button
            onClick={() => {
              setMenuOpen((v) => !v);
              setProfilePanelOpen(false);
            }}
            className="relative h-10 w-10 overflow-hidden rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)]"
          >
            {me?.avatar_url ? <img src={me.avatar_url} alt="avatar" className="h-full w-full object-cover" /> : <span className="text-lg font-bold">{(me?.display_name ?? me?.name ?? 'S').slice(0, 1).toUpperCase()}</span>}
          </button>

          {menuOpen ? (
            <div className="absolute left-16 top-6 z-40 w-56 border border-[var(--chat-border)] bg-[var(--chat-surface)] p-2 text-sm shadow-lg">
              <button onClick={() => { setProfilePanelOpen(true); setMenuOpen(false); }} className="block w-full px-3 py-2 text-left hover:bg-[var(--chat-hover)]">Profile</button>
              <button onClick={() => void signOut()} className="block w-full px-3 py-2 text-left text-[#b3261e] hover:bg-[var(--chat-hover)]">Sign out</button>
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-3">
            <button onClick={() => setDarkMode((v) => !v)} className="h-10 w-10 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-xl">{darkMode ? '☀' : '☾'}</button>
          </div>
        </aside>

        <aside className="border-r border-[var(--chat-border)] bg-[var(--chat-side)] p-4 text-[var(--chat-text)] overflow-auto">
          <button onClick={() => router.push('/workspaces')} className="mb-4 border border-[var(--chat-border)] px-3 py-2 text-sm hover:bg-[var(--chat-hover)]">Back to workspaces</button>

          <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[var(--chat-muted)]">Starred</p>
          <div className="mt-2 space-y-1">
            {starredChannels.length === 0 ? <p className="px-2 text-sm text-[var(--chat-muted)]">Drag and drop important stuff here</p> : null}
            {starredChannels.map((c) => (
              <button key={c.id} onClick={() => { setSelectedConv(''); setSelectedChannel(c.id); }} className="flex w-full items-center justify-between px-2 py-1 text-left hover:bg-[var(--chat-hover)]">
                <span># {c.name}</span>
                <span className="text-[#D4E157]">★</span>
              </button>
            ))}
          </div>

          <div className="mt-6 group flex items-center justify-between">
            <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[var(--chat-muted)]">Channels</p>
            <button
              onClick={() => {
                setCreateChannelModalOpen(true);
                setCreateChannelStep(1);
                setCreateIsPrivate(false);
                setNewChannel('');
              }}
              className="invisible h-6 w-6 border border-[var(--chat-border)] text-sm leading-none hover:bg-[var(--chat-hover)] group-hover:visible"
              aria-label="Create channel"
            >
              +
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {channels.map((c) => {
              const starred = starredChannelIds.includes(c.id);
              return (
                <div key={c.id} className={`group flex items-center ${selectedChannel === c.id ? 'bg-[var(--chat-hover)] text-[var(--chat-text)]' : ''}`}>
                  <button onClick={() => { setSelectedConv(''); setSelectedChannel(c.id); }} className="block w-full px-2 py-1 text-left hover:bg-[var(--chat-hover)]"># {c.name}</button>
                  <button
                    onClick={() => toggleStarChannel(c.id)}
                    className={`mr-1 px-1 ${starred ? 'text-[var(--chat-text)]' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                    aria-label="Toggle star"
                  >
                    {starred ? '★' : '☆'}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-[0.72rem] uppercase tracking-[0.1em] text-[var(--chat-muted)]">Direct messages</p>
          <div className="mt-2 space-y-1">
            <button onClick={() => void openSelfDm()} className={`block w-full px-2 py-1 text-left ${isSelfConversation ? 'bg-[var(--chat-hover)] text-[var(--chat-text)]' : 'hover:bg-[var(--chat-hover)]'}`}>
              {me ? `@ ${getMemberName(me)}` : '@ me'}
            </button>
            {convs.filter((c) => !me || c.peer_user_id !== me.id).map((c) => (
              <button key={c.id} onClick={() => { setSelectedChannel(''); setSelectedConv(c.id); }} className={`block w-full px-2 py-1 text-left ${selectedConv === c.id ? 'bg-[var(--chat-hover)] text-[var(--chat-text)]' : 'hover:bg-[var(--chat-hover)]'}`}>@ {getMemberName(profileMap.get(c.peer_user_id ?? ''))}</button>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={() => setInviteTeammatesModalOpen(true)}
              className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--chat-hover)]"
            >
              ⍟ Invite teammates
            </button>
          </div>
        </aside>

        <section className="grid min-h-0 grid-cols-[1fr_auto] bg-[var(--chat-main)]">
          <div className="grid min-h-0 grid-rows-[auto_1fr_auto]">
            <header className="border-b border-[var(--chat-border)] px-6 py-4 flex items-center gap-3">
              <button onClick={scope === 'channel' ? openChannelSettings : undefined} className="text-3xl font-extrabold hover:underline">
                {scope === 'dm' ? `@ ${getMemberName(selectedConversation ? profileMap.get(selectedConversation.peer_user_id ?? '') : null)}` : `# ${currentChannel?.name ?? 'channel'}`}
              </button>
              {scope === 'channel' ? <button onClick={openChannelSettings} className="border border-[var(--chat-border)] px-2 py-1 text-sm">✎</button> : null}
            </header>

            <div className="overflow-auto p-6 space-y-3">
              {isSelfConversation ? (
                <div className="mb-5 border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-20 w-20 overflow-hidden rounded-md border border-[var(--chat-border)]">
                      {me?.avatar_url ? <img src={me.avatar_url} alt="me" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div>
                      <p className="text-3xl font-bold">{getMemberName(me)}</p>
                      <p className="mt-1 text-sm text-[var(--chat-muted)]">This is your space. Keep notes, reminders and personal drafts.</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--chat-muted)] opacity-60">send your first message!</p>
              ) : null}

              {messages.map((m) => {
                const profile = profileMap.get(m.user_id);
                return (
                  <div key={m.id} className="border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="h-9 w-9 overflow-hidden rounded-full border border-[var(--chat-border)] bg-[var(--chat-main)]">
                        {profile?.avatar_url ? <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs font-bold">{getMemberName(profile).slice(0, 1).toUpperCase()}</div>}
                      </div>
                      <button
                        onClick={() => {
                          if (!profile) return;
                          setSelectedProfile(profile);
                          setProfilePanelOpen(true);
                        }}
                        className="text-left hover:underline"
                      >
                        <p className="font-semibold">{getMemberName(profile)}</p>
                        <p className="text-xs text-[var(--chat-muted)]">{new Date(m.created_at).toLocaleTimeString()}</p>
                      </button>
                    </div>
                    <p>{m.content}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-[var(--chat-border)] p-4 flex gap-2 bg-[var(--chat-side)]">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sendMessage(); }} className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2" placeholder="Message..." />
              <button onClick={() => void sendMessage()} className="grid h-11 w-12 place-items-center border border-[var(--chat-border)] bg-[var(--chat-hover)] text-[var(--chat-text)]" aria-label="Send message">
                <span className="text-lg">➤</span>
              </button>
            </div>
          </div>

          {profilePanelOpen ? (
            <aside className="w-[380px] border-l border-[var(--chat-border)] bg-[var(--chat-surface)] p-4 overflow-auto">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-3xl font-bold">Profile</h3>
                <button onClick={() => setProfilePanelOpen(false)} className="text-2xl">×</button>
              </div>

              <div className="overflow-hidden border border-[var(--chat-border)] bg-[var(--chat-main)]">
                <div className="mx-auto mt-4 h-56 w-56 overflow-hidden rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)]">
                  {activeProfile?.avatar_url ? <img src={activeProfile.avatar_url} alt="avatar" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-4xl font-bold">{getMemberName(activeProfile)}</p>
                    {activeProfile?.user_id === me?.id ? <button onClick={() => { setShowEditProfile(true); setAvatarPreview(null); }} className="text-sm font-semibold underline">Edit</button> : null}
                  </div>
                  <p className="text-sm text-[var(--chat-muted)]">@{activeProfile?.username ?? 'unknown'}</p>
                  <p className="mt-3 text-sm">{activeProfile?.status_text || 'No status set'}</p>
                  <div className="mt-4 grid gap-2">
                    {activeProfile?.user_id === me?.id ? (
                      <>
                        <button onClick={() => setShowEditStatus(true)} className="border border-[var(--chat-border)] px-3 py-2 text-left">Edit status</button>
                        <button onClick={() => setShowEditContact(true)} className="border border-[var(--chat-border)] px-3 py-2 text-left">Edit contact information</button>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-6 border-t border-[var(--chat-border)] pt-4 text-sm text-[var(--chat-muted)]">
                    <p>{activeProfile?.email ?? 'No email'}</p>
                    <p className="mt-1">{activeProfile?.phone ?? 'No phone'}</p>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </section>
      </div>

      {modalOpen && currentChannel ? (
        <ModalShell title={<h2 className="text-4xl font-bold"># {currentChannel.name}</h2>} onClose={() => setModalOpen(false)}>
          <div className="flex gap-6 border-b border-[#eee] pb-2">
            <button onClick={() => setTab('about')} className={`pb-2 ${tab === 'about' ? 'border-b-2 border-[#1A1A1A] font-semibold' : ''}`}>About</button>
            <button onClick={() => { setTab('members'); void loadChannelMembers(); }} className={`pb-2 ${tab === 'members' ? 'border-b-2 border-[#1A1A1A] font-semibold' : ''}`}>Members</button>
          </div>

          <div className="pt-4">
            {tab === 'about' ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-[#666]">Channel name</p>
                    {!isEditingAbout ? (
                      <button onClick={() => setIsEditingAbout(true)} className="text-sm font-semibold text-[#1A1A1A] underline">Edit</button>
                    ) : null}
                  </div>
                  {isEditingAbout ? (
                    <div className="flex gap-2">
                      <input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="w-full border border-[#6B6B6B] px-3 py-2" />
                      <button onClick={() => void saveChannelName()} className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4">Save</button>
                      <button onClick={() => { setEditingName(currentChannel?.name ?? ''); setIsEditingAbout(false); }} className="border border-[#6B6B6B] px-4">Cancel</button>
                    </div>
                  ) : (
                    <p className="border border-[#eee] bg-[#fafafa] px-3 py-2">{currentChannel.name}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-[#666]">Workspace</p>
                  <p>{workspaceId}</p>
                </div>
                <div>
                  <p className="text-sm text-[#666]">Members</p>
                  <p>{channelMembers.length}</p>
                </div>
                <button onClick={() => void leaveChannel()} className="border border-[#B3261E] text-[#B3261E] px-4 py-2">Leave channel</button>
              </div>
            ) : (
              <div className="space-y-2">
                {channelMembers.map((m) => (
                  <div key={m.user_id} className="border border-[#eee] p-3 flex items-center justify-between">
                    <button onClick={() => { setSelectedProfile(m); setProfilePanelOpen(true); }} className="text-left hover:underline">
                      <p className="font-semibold">{getMemberName(m)} {m.user_id === me?.id ? '(you)' : ''}</p>
                      <p className="text-sm text-[#666]">@{m.username ?? 'unknown'} · {m.role}</p>
                    </button>
                    {m.user_id !== me?.id ? (
                      <button onClick={() => void kickMember(m.user_id)} className="border border-[#B3261E] text-[#B3261E] px-3 py-1">Kick</button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ModalShell>
      ) : null}

      {showEditProfile ? (
        <ModalShell title={<h2 className="text-3xl font-bold">Edit your profile</h2>} onClose={() => { setShowEditProfile(false); setAvatarPreview(null); }} className="max-w-4xl">
          <div className="grid gap-6 md:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[#666]">Full name</label>
                <input value={profileForm.fullName} onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))} className="w-full border border-[#6B6B6B] px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[#666]">Display name</label>
                <input value={profileForm.displayName} onChange={(e) => setProfileForm((p) => ({ ...p, displayName: e.target.value }))} className="w-full border border-[#6B6B6B] px-3 py-2" />
              </div>
              <div className="pt-2">
                <button disabled={savingProfile} onClick={() => void saveProfile()} className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4 py-2 text-[#1A1A1A]">Save changes</button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-[#666]">Profile photo</p>
              <div className="h-56 w-56 overflow-hidden border border-[#6B6B6B] bg-[#eee]">
                {(avatarPreview || me?.avatar_url) ? <img src={avatarPreview ?? me?.avatar_url ?? ''} alt="avatar" className="h-full w-full object-cover" /> : null}
              </div>
              <button onClick={() => editAvatarInputRef.current?.click()} className="mt-3 border border-[#6B6B6B] px-4 py-2">Upload photo</button>
              <input ref={editAvatarInputRef} type="file" accept="image/*" className="hidden" onChange={onEditAvatarPick} />
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showEditContact ? (
        <ModalShell title={<h2 className="text-3xl font-bold">Edit Contact information</h2>} onClose={() => setShowEditContact(false)} className="max-w-2xl">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#666]">Email Address</label>
              <input value={contactForm.email} disabled className="w-full border border-[#6B6B6B] bg-[#f3f3f3] px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#666]">Phone</label>
              <input value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} className="w-full border border-[#6B6B6B] px-3 py-2" placeholder="Add phone" />
            </div>
            <div className="pt-2">
              <button disabled={savingProfile} onClick={() => void saveContact()} className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4 py-2 text-[#1A1A1A]">Save changes</button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showEditStatus ? (
        <ModalShell title={<h2 className="text-3xl font-bold">Edit status</h2>} onClose={() => setShowEditStatus(false)} className="max-w-2xl">
          <div className="space-y-4">
            <label className="block text-sm text-[#666]">Status</label>
            <input value={statusForm} onChange={(e) => setStatusForm(e.target.value)} className="w-full border border-[#6B6B6B] px-3 py-2" placeholder="Set a status" />
            <button disabled={savingProfile} onClick={() => void saveStatus()} className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4 py-2 text-[#1A1A1A]">Save changes</button>
          </div>
        </ModalShell>
      ) : null}

      {createChannelModalOpen ? (
        <ModalShell title={<h2 className="text-3xl font-bold">Create a channel</h2>} onClose={() => setCreateChannelModalOpen(false)} className="max-w-2xl" bodyClassName="h-[320px]">
          {createChannelStep === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[#4E4E4E]">Name</label>
                <div className="flex items-center border border-[#6B6B6B] bg-[#F7F4EE] px-3 py-2">
                  <span className="mr-2 text-xl text-[#6B6B6B]">#</span>
                  <input
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    placeholder="e.g. plan-budget"
                    maxLength={80}
                    className="w-full bg-transparent outline-none"
                  />
                  <span className="text-sm text-[#6B6B6B]">{80 - newChannel.length}</span>
                </div>
                <p className="mt-2 text-sm text-[#6B6B6B]">Channels are where conversations happen around a topic. Use a name that is easy to find and understand.</p>
              </div>
              <div className="flex items-center justify-between pt-6">
                <p className="text-sm text-[#6B6B6B]">Step 1 of 2</p>
                <button
                  onClick={() => setCreateChannelStep(2)}
                  disabled={!newChannel.trim()}
                  className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-6 py-2 font-semibold text-[#1A1A1A] disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[#6B6B6B]"># {newChannel.trim()}</p>
              <div>
                <p className="mb-2 text-2xl font-semibold">Visibility</p>
                <label className="flex items-start gap-3 py-2">
                  <input type="radio" checked={!createIsPrivate} onChange={() => setCreateIsPrivate(false)} />
                  <span>
                    <span className="block">Public - anyone in workspace</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 py-2">
                  <input type="radio" checked={createIsPrivate} onChange={() => setCreateIsPrivate(true)} />
                  <span>
                    <span className="block">Private - only specific people</span>
                    <span className="block text-sm text-[#6B6B6B]">Can only be viewed or joined by invitation</span>
                  </span>
                </label>
              </div>
              <div className="flex items-center justify-between pt-6">
                <p className="text-sm text-[#6B6B6B]">Step 2 of 2</p>
                <div className="flex gap-2">
                  <button onClick={() => setCreateChannelStep(1)} className="border border-[#6B6B6B] px-6 py-2">Back</button>
                  <button
                    onClick={() => void createChannel()}
                    disabled={!newChannel.trim() || creatingChannel}
                    className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-6 py-2 font-semibold text-[#1A1A1A] disabled:opacity-50"
                  >
                    {creatingChannel ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </ModalShell>
      ) : null}


      {inviteTeammatesModalOpen ? (
        <ModalShell
          title={<h2 className="text-3xl font-bold">Invite teammates</h2>}
          onClose={() => { setInviteTeammatesModalOpen(false); setInviteTeammatesInput(''); }}
          className="max-w-2xl"
          bodyClassName="h-[320px]"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#6B6B6B]">Invite by email (space/comma separated)</p>
            <input
              value={inviteTeammatesInput}
              onChange={(e) => setInviteTeammatesInput(e.target.value)}
              placeholder="ex. quangue@gmail.com, anhle@gmail.com"
              className="w-full border border-[#6B6B6B] bg-[#F7F4EE] px-3 py-2"
            />
            <div className="flex items-center justify-end gap-2 pt-8">
              <button onClick={() => { setInviteTeammatesModalOpen(false); setInviteTeammatesInput(''); }} className="border border-[#6B6B6B] px-4 py-2">Cancel</button>
              <button
                onClick={() => void inviteWorkspaceTeammates()}
                disabled={!inviteTeammatesInput.trim() || invitingTeammates}
                className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4 py-2 text-[#1A1A1A] disabled:opacity-50"
              >
                {invitingTeammates ? 'Inviting...' : 'Invite'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {inviteAfterCreateModalOpen && inviteChannel ? (
        <ModalShell
          title={<h2 className="text-3xl font-bold">Add people to {inviteChannel.is_private ? '🔒 ' : ''}{inviteChannel.name}</h2>}
          onClose={() => { setInviteAfterCreateModalOpen(false); setInviteChannel(null); setInviteInput(''); }}
          className="max-w-2xl"
          bodyClassName="h-[320px]"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#6B6B6B]">Enter teammate usernames (space or comma separated)</p>
            <input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="ex. quangue, anhle"
              className="w-full border border-[#6B6B6B] bg-[#F7F4EE] px-3 py-2"
            />
            <div className="flex items-center justify-end gap-2 pt-8">
              <button
                onClick={() => { setInviteAfterCreateModalOpen(false); setInviteChannel(null); setInviteInput(''); }}
                className="border border-[#6B6B6B] px-4 py-2"
              >
                Skip for now
              </button>
              <button
                onClick={() => void inviteMembersAfterCreate()}
                disabled={!inviteInput.trim() || invitingMembers}
                className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4 py-2 text-[#1A1A1A] disabled:opacity-50"
              >
                {invitingMembers ? 'Adding...' : 'Add people'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<main className="h-screen w-full grid place-items-center">Loading chat...</main>}>
      <ChatPageClient />
    </Suspense>
  );
}
