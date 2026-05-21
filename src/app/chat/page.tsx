'use client';

import { ChangeEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { clearTokens, getRefreshToken } from '@/lib/auth';
import { ModalShell } from '@/components/modal-shell';
import { getSocket, disconnectSocket, NewMessagePayload, TypingPayload } from '@/lib/socket';

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
type MessageReactionSummary = {
  emoji: MessageReaction;
  count: number;
  reacted_by_me: boolean;
};
type Msg = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_edited?: boolean;
  reactions?: MessageReactionSummary[];
};
type MessageReaction = '👍' | '❤️' | '😂' | '🎉';
type ReactionState = Partial<Record<MessageReaction, { count: number; reactedByMe: boolean }>>;
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

function Avatar({ src, name, className = "h-9 w-9" }: { src?: string | null; name: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = name.trim().slice(0, 1).toUpperCase() || '?';
  const shouldShowImage = Boolean(src) && failedSrc !== src;

  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--chat-border)] text-[var(--chat-surface)] font-bold select-none ${className}`}>
      {shouldShowImage ? (
        <Image
          src={src ?? ''}
          alt={name}
          fill
          unoptimized
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

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
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([]);
  const [invitingMembers, setInvitingMembers] = useState(false);
  const [selectedChannelInviteUserIds, setSelectedChannelInviteUserIds] = useState<string[]>([]);
  const [editingIsPrivate, setEditingIsPrivate] = useState(false);
  const [savingChannelSettings, setSavingChannelSettings] = useState(false);

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

  const processedMessages = useMemo(() => {
    type ProcessedMessage = Msg & { showHeader: boolean; groupIndex: number };

    return messages.reduce<ProcessedMessage[]>((acc, message, index) => {
      const previousMessage = messages[index - 1];
      const previousProcessed = acc[index - 1];
      const currentTime = new Date(message.created_at).getTime();
      const previousTime = previousMessage ? new Date(previousMessage.created_at).getTime() : 0;
      const showHeader =
        !previousMessage ||
        previousMessage.user_id !== message.user_id ||
        currentTime - previousTime > 5 * 60 * 1000;
      const previousGroup = previousProcessed?.groupIndex ?? -1;
      const groupIndex = showHeader ? previousGroup + 1 : previousGroup;

      return [...acc, { ...message, showHeader, groupIndex }];
    }, []);
  }, [messages]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [starredChannelIds, setStarredChannelIds] = useState<string[]>([]);

  const editAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [typingUsers, setTypingUsers] = useState<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [reactionMap, setReactionMap] = useState<Record<string, ReactionState>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

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
  const workspaceOwnerId = useMemo(
    () => members.find((member) => member.role === 'OWNER')?.user_id ?? null,
    [members],
  );
  const channelMemberIds = useMemo(
    () => new Set(channelMembers.map((member) => member.user_id)),
    [channelMembers],
  );
  const addableChannelMembers = useMemo(
    () => members.filter((member) => !channelMemberIds.has(member.user_id)),
    [channelMemberIds, members],
  );

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

  function toggleSelectedUserId(userId: string, selected: boolean, scope: 'create' | 'settings') {
    const setter = scope === 'create' ? setSelectedInviteUserIds : setSelectedChannelInviteUserIds;
    setter((current) => (
      selected
        ? Array.from(new Set([...current, userId]))
        : current.filter((id) => id !== userId)
    ));
  }

  function canEditMessage(message: Msg) {
    if (!me || message.user_id !== me.id) return false;
    const diffMs = nowMs - new Date(message.created_at).getTime();
    return diffMs <= 10 * 60 * 1000;
  }

  function reactionsToState(reactions: MessageReactionSummary[] = []) {
    return reactions.reduce<ReactionState>((state, reaction) => ({
      ...state,
      [reaction.emoji]: {
        count: reaction.count,
        reactedByMe: reaction.reacted_by_me,
      },
    }), {});
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

      if (!selectedChannel && !selectedConv && ch.channels?.[0]?.id) {
        setSelectedChannel(ch.channels[0].id);
        const initialMembers = await apiCall<{ ok: boolean; members: Member[] }>(
          `/api/ws/channels/workspace/${workspaceId}/${ch.channels[0].id}/members`,
          { method: 'GET' },
          true,
        );
        setChannelMembers(initialMembers.members ?? []);
      }
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
      setReactionMap(Object.fromEntries((res.messages ?? []).map((message) => [message.id, reactionsToState(message.reactions)])));
      return;
    }
    if (selectedChannel) {
      const res = await apiCall<{ ok: boolean; messages: Msg[] }>(`/api/chat/messages/channel/${selectedChannel}`, { method: 'GET' }, true);
      setMessages(res.messages ?? []);
      setReactionMap(Object.fromEntries((res.messages ?? []).map((message) => [message.id, reactionsToState(message.reactions)])));
      return;
    }
    setMessages([]);
    setReactionMap({});
  }

  async function loadChannelMembers(channelId = selectedChannel) {
    if (!channelId || !workspaceId) return;
    const res = await apiCall<{ ok: boolean; members: Member[] }>(`/api/ws/channels/workspace/${workspaceId}/${channelId}/members`, { method: 'GET' }, true);
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

  useEffect(() => {
    const tenMinutesMs = 10 * 60 * 1000;
    const myMessages = messages.filter((message) => message.user_id === me?.id);
    if (myMessages.length === 0) return;

    const nextExpiryAt = myMessages
      .map((message) => new Date(message.created_at).getTime() + tenMinutesMs)
      .filter((expiresAt) => expiresAt > nowMs)
      .sort((a, b) => a - b)[0];

    if (!nextExpiryAt) return;

    const timeoutMs = Math.max(0, nextExpiryAt - nowMs + 20);
    const timeoutId = window.setTimeout(() => {
      setNowMs(Date.now());
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [messages, me?.id, nowMs]);

  // --- WebSocket connection & event listeners ---
  useEffect(() => {
    if (!workspaceId || !me) return;

    const socket = getSocket();

    const handleNewMessage = (msg: NewMessagePayload) => {
      setMessages((prev) => {
        // Avoid duplicates (optimistic UI may have already added it)
        if (prev.some((m) => m.id === msg.id)) return prev;
        // Only add if it belongs to the currently viewed channel/conversation
        const isCurrentChannel = msg.channel_id && msg.channel_id === selectedChannel;
        const isCurrentConv = msg.conversation_id && msg.conversation_id === selectedConv;
        if (!isCurrentChannel && !isCurrentConv) return prev;

        // If we received our own broadcasted message first, replace the matching optimistic one
        const optIndex = prev.findIndex(
          (m) => m.id.startsWith('opt-') && m.user_id === msg.user_id && m.content === msg.content
        );
        if (optIndex !== -1) {
          const next = [...prev];
          next[optIndex] = {
            id: msg.id,
            user_id: msg.user_id,
            content: msg.content,
            created_at: msg.created_at,
          };
          return next;
        }

        return [...prev, {
          id: msg.id,
          user_id: msg.user_id,
          content: msg.content,
          created_at: msg.created_at,
        }];
      });
    };

    const handleTyping = (payload: TypingPayload) => {
      const isCurrentChannel = payload.channelId && payload.channelId === selectedChannel;
      const isCurrentConv = payload.conversationId && payload.conversationId === selectedConv;
      if (!isCurrentChannel && !isCurrentConv) return;
      if (payload.userId === me.id) return; // ignore own typing

      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (payload.isTyping) {
          // Clear existing timeout for this user
          const existing = next.get(payload.userId);
          if (existing) clearTimeout(existing);
          // Auto-clear after 3 seconds
          const timeout = setTimeout(() => {
            setTypingUsers((p) => {
              const n = new Map(p);
              n.delete(payload.userId);
              return n;
            });
          }, 3000);
          next.set(payload.userId, timeout);
        } else {
          const existing = next.get(payload.userId);
          if (existing) clearTimeout(existing);
          next.delete(payload.userId);
        }
        return next;
      });
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('typing', handleTyping);

    // Join the current room
    if (selectedChannel) {
      socket.emit('joinChannel', { channelId: selectedChannel });
    }
    if (selectedConv) {
      socket.emit('joinConversation', { conversationId: selectedConv });
    }

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('typing', handleTyping);
      if (selectedChannel) {
        socket.emit('leaveChannel', { channelId: selectedChannel });
      }
      if (selectedConv) {
        socket.emit('leaveConversation', { conversationId: selectedConv });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, me?.id, selectedChannel, selectedConv]);

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  async function createChannel() {
    if (!newChannel.trim()) return;
    setCreatingChannel(true);
    try {
      const res = await apiCall<{ ok: boolean; channel: Channel }>(`/api/ws/channels/workspaces/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify({
          name: newChannel.trim(),
          isPrivate: createIsPrivate,
          memberIds: createIsPrivate ? selectedInviteUserIds : [],
        }),
      }, true);

      const created = res.channel;
      setCreateChannelModalOpen(false);
      setCreateChannelStep(1);
      setSelectedInviteUserIds([]);
      setInviteChannel(createIsPrivate ? created : null);
      setInviteAfterCreateModalOpen(createIsPrivate);

      setNewChannel('');
      await loadAll();
      if (created?.id) {
        setSelectedConv('');
        setSelectedChannel(created.id);
        await loadChannelMembers(created.id);
      }
    } finally {
      setCreatingChannel(false);
    }
  }

  function parseInviteItems(raw: string) {
    return Array.from(new Set(raw.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)));
  }

  async function inviteMembersAfterCreate() {
    if (!inviteChannel || selectedInviteUserIds.length === 0) return;
    setInvitingMembers(true);
    try {
      await apiCall(`/api/ws/channels/workspace/${workspaceId}/${inviteChannel.id}/invite-users`, {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedInviteUserIds }),
      }, true);
      setSelectedInviteUserIds([]);
      setInviteAfterCreateModalOpen(false);
      setInviteChannel(null);
      await loadChannelMembers();
      await loadAll();
      window.alert('Invited channel members successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to invite members';
      window.alert(message);
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
      window.alert('Workspace invitations sent successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invitations';
      window.alert(message);
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

  function sendMessage() {
    if (!text.trim()) return;

    const socket = getSocket();
    const rawContent = text.trim();
    const replyPrefix = replyingTo
      ? `↪ ${getMemberName(profileMap.get(replyingTo.user_id))}: ${replyingTo.content.slice(0, 60)}\n`
      : '';
    const content = `${replyPrefix}${rawContent}`;

    // Optimistic UI: immediately add the message to the local state
    const optimisticMsg: Msg = {
      id: `opt-${Date.now()}`,
      user_id: me?.id ?? '',
      content,
      created_at: new Date().toISOString(),
    };
    setNowMs(Date.now());
    setMessages((prev) => [...prev, optimisticMsg]);
    setText('');
    setReplyingTo(null);

    // Send via WebSocket
    socket.emit('sendMessage', {
      channelId: selectedChannel || undefined,
      conversationId: selectedConv || undefined,
      content,
    }, (ack: { ok: boolean; message?: { id: string } }) => {
      if (ack?.ok && ack.message) {
        // Replace optimistic message ID with the real one from the server (if it hasn't been replaced by the broadcast already)
        setMessages((prev) => {
          if (prev.some((m) => m.id === ack.message!.id)) {
            // Already replaced by broadcast, just filter out the optimistic one if it's still there
            return prev.filter((m) => m.id !== optimisticMsg.id);
          }
          return prev.map((m) => m.id === optimisticMsg.id ? { ...m, id: ack.message!.id } : m);
        });
      }
    });

    // Stop typing indicator
    socket.emit('typing', {
      channelId: selectedChannel || undefined,
      conversationId: selectedConv || undefined,
      isTyping: false,
    });
  }

  async function toggleReaction(messageId: string, emoji: MessageReaction) {
    const res = await apiCall<{ ok: boolean; message_id: string; reactions: MessageReactionSummary[] }>(
      `/api/chat/messages/${messageId}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      },
      true,
    );

    setReactionMap((prev) => ({
      ...prev,
      [res.message_id]: reactionsToState(res.reactions),
    }));
    setMessages((prev) => prev.map((message) => (message.id === res.message_id ? { ...message, reactions: res.reactions } : message)));
  }

  function startReply(message: Msg) {
    setReplyingTo(message);
  }

  function startEditMessage(message: Msg) {
    if (!canEditMessage(message)) return;
    setEditingMessageId(message.id);
    setEditingDraft(message.content);
  }

  async function saveEditedMessage(messageId: string) {
    const content = editingDraft.trim();
    if (!content) return;

    try {
      const res = await apiCall<{ ok: boolean; message: Msg & { is_edited?: boolean } }>(
        `/api/chat/messages/${messageId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ content }),
        },
        true,
      );
      const edited = res.message;
      setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content: edited.content, is_edited: edited.is_edited } : msg)));
      setEditingMessageId(null);
      setEditingDraft('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to edit message';
      window.alert(message);
    }
  }

  const emitTyping = useCallback(() => {
    const socket = getSocket();
    socket.emit('typing', {
      channelId: selectedChannel || undefined,
      conversationId: selectedConv || undefined,
      isTyping: true,
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Stop typing after 2 seconds of no input
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', {
        channelId: selectedChannel || undefined,
        conversationId: selectedConv || undefined,
        isTyping: false,
      });
    }, 2000);
  }, [selectedChannel, selectedConv]);

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
    setEditingIsPrivate(Boolean(currentChannel?.is_private));
    setIsEditingAbout(false);
    setSelectedChannelInviteUserIds([]);
    setTab('about');
    setModalOpen(true);
    await loadChannelMembers();
  }

  async function saveChannelSettings() {
    if (!selectedChannel) return;
    setSavingChannelSettings(true);
    try {
      const res = await apiCall<{ ok: boolean; channel: Channel }>(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingName.trim(), isPrivate: editingIsPrivate }),
      }, true);
      await loadAll();
      await loadChannelMembers();
      if (res.channel?.id) {
        setSelectedChannel(res.channel.id);
      }
      setIsEditingAbout(false);
      window.alert('Channel name updated successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update channel name';
      window.alert(message);
    } finally {
      setSavingChannelSettings(false);
    }
  }

  async function inviteSelectedChannelMembers() {
    if (!selectedChannel || selectedChannelInviteUserIds.length === 0) return;
    setInvitingMembers(true);
    try {
      await apiCall(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}/invite-users`, {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedChannelInviteUserIds }),
      }, true);
      setSelectedChannelInviteUserIds([]);
      await loadChannelMembers();
      await loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add members';
      window.alert(message);
    } finally {
      setInvitingMembers(false);
    }
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
      window.alert('Contact info updated successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update contact info';
      window.alert(message);
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
      window.alert('Status updated successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update status';
      window.alert(message);
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
            <Avatar src={me?.avatar_url} name={getMemberName(me)} className="h-full w-full" />
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
              <button key={c.id} onClick={() => { setSelectedConv(''); setSelectedChannel(c.id); void loadChannelMembers(c.id); }} className="flex w-full items-center justify-between px-2 py-1 text-left hover:bg-[var(--chat-hover)]">
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
              setSelectedInviteUserIds([]);
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
                  <button onClick={() => { setSelectedConv(''); setSelectedChannel(c.id); void loadChannelMembers(c.id); }} className="block w-full px-2 py-1 text-left hover:bg-[var(--chat-hover)]"># {c.name}</button>
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
              {me ? `@ ${getMemberName(me)}` : '@ me'} <span className="text-[var(--chat-muted)]">(you)</span>
            </button>
            {members.filter((m) => m.user_id !== me?.id).map((m) => {
              const activeConv = convs.find((c) => c.peer_user_id === m.user_id);
              const isSelected = activeConv && selectedConv === activeConv.id;
              return (
                <button
                  key={m.user_id}
                  onClick={() => void openDm(m.user_id)}
                  className={`block w-full px-2 py-1 text-left ${isSelected ? 'bg-[var(--chat-hover)] text-[var(--chat-text)]' : 'hover:bg-[var(--chat-hover)]'}`}
                >
                  @ {getMemberName(m)}
                </button>
              );
            })}
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
              {scope === 'channel' ? (
                <button
                  onClick={() => {
                    setModalOpen(true);
                    setTab('members');
                    void loadChannelMembers();
                  }}
                  className="ml-auto flex items-center gap-1 border border-[var(--chat-border)] px-2 py-1 text-sm hover:bg-[var(--chat-hover)]"
                  aria-label="Open channel members"
                >
                  <span>👤</span>
                  <span>{channelMembers.length}</span>
                </button>
              ) : null}
            </header>

            <div className="overflow-auto py-4 space-y-0">
              {isSelfConversation ? (
                <div className="mx-6 mb-5 border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-20 w-20 overflow-hidden rounded-md border border-[var(--chat-border)]">
                      <Avatar src={me?.avatar_url} name={getMemberName(me)} className="h-full w-full" />
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

              {processedMessages.map((m) => {
                const profile = profileMap.get(m.user_id);
                const isAltBackground = m.groupIndex % 2 === 1;
                const isEditingCurrentMessage = editingMessageId === m.id && canEditMessage(m);
                
                return (
                  <div
                    key={m.id}
                    className="group relative flex items-start px-6 transition-colors hover:bg-[var(--chat-hover)]"
                    style={{
                      backgroundColor: isAltBackground ? 'rgba(128, 128, 128, 0.04)' : 'transparent',
                      paddingTop: m.showHeader ? '0.75rem' : '0.15rem',
                      paddingBottom: '0.15rem',
                    }}
                  >
                    <div className="absolute right-6 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto flex items-center gap-1 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1 shadow-md">
                      {(['👍', '❤️', '😂', '🎉'] as MessageReaction[]).map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => void toggleReaction(m.id, emoji)}
                          className={`px-1.5 py-0.5 text-sm transition-transform hover:scale-125 ${reactionMap[m.id]?.[emoji]?.reactedByMe ? 'bg-[var(--chat-hover)]' : ''}`}
                          aria-label={`React ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <div className="mx-1 h-4 w-[1px] bg-[var(--chat-border)]" />
                      <button
                        onClick={() => startReply(m)}
                        className="px-1.5 py-0.5 text-xs text-[var(--chat-muted)] hover:text-[var(--chat-text)] font-semibold"
                        aria-label="Reply message"
                      >
                        Reply
                      </button>
                      {canEditMessage(m) ? (
                        <button
                          onClick={() => startEditMessage(m)}
                          className="px-1.5 py-0.5 text-xs text-[var(--chat-muted)] hover:text-[var(--chat-text)] font-semibold"
                          aria-label="Edit message"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>

                    {m.showHeader ? (
                      <div className="flex gap-3 w-full">
                        <button
                          onClick={() => {
                            if (!profile) return;
                            setSelectedProfile(profile);
                            setProfilePanelOpen(true);
                          }}
                          className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--chat-border)] bg-[var(--chat-main)] hover:opacity-85"
                          aria-label="Open profile modal"
                        >
                          <Avatar src={profile?.avatar_url} name={getMemberName(profile)} className="h-full w-full" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <button
                              onClick={() => {
                                if (!profile) return;
                                setSelectedProfile(profile);
                                setProfilePanelOpen(true);
                              }}
                              className="font-bold text-sm text-[var(--chat-text)] hover:underline text-left"
                            >
                              {getMemberName(profile)}
                            </button>
                            <span className="text-[0.7rem] text-[var(--chat-muted)] select-none">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {isEditingCurrentMessage ? (
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                value={editingDraft}
                                onChange={(event) => setEditingDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') void saveEditedMessage(m.id);
                                  if (event.key === 'Escape') {
                                    setEditingMessageId(null);
                                    setEditingDraft('');
                                  }
                                }}
                                className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1 text-sm"
                              />
                              <button onClick={() => void saveEditedMessage(m.id)} className="border border-[var(--chat-border)] px-2 py-1 text-xs">Save</button>
                              <button onClick={() => { setEditingMessageId(null); setEditingDraft(''); }} className="border border-[var(--chat-border)] px-2 py-1 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <div className="mt-1 text-[0.92rem] text-[var(--chat-text)] leading-relaxed break-words">
                              {m.content}
                              {m.is_edited ? <span className="ml-2 text-[0.7rem] text-[var(--chat-muted)]">(edited)</span> : null}
                            </div>
                          )}
                          {reactionMap[m.id] ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(reactionMap[m.id]).map(([emoji, reaction]) => {
                                const count = reaction?.count ?? 0;
                                if (!count) return null;
                                return (
                                  <button
                                    key={`${m.id}-${emoji}`}
                                    onClick={() => void toggleReaction(m.id, emoji as MessageReaction)}
                                    className={`rounded-full border border-[var(--chat-border)] px-2 py-0.5 text-xs ${reaction?.reactedByMe ? 'bg-[var(--chat-hover)] font-semibold' : ''}`}
                                  >
                                    {emoji} {count}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 w-full">
                        <div className="w-9 shrink-0 text-right pr-2 text-[0.65rem] text-[var(--chat-muted)] opacity-0 group-hover:opacity-100 select-none pt-0.5 font-light transition-opacity">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5)}
                        </div>
                        <div className="min-w-0 flex-1 text-[0.92rem] text-[var(--chat-text)] leading-relaxed break-words">
                          {isEditingCurrentMessage ? (
                            <div className="flex items-center gap-2">
                              <input
                                value={editingDraft}
                                onChange={(event) => setEditingDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') void saveEditedMessage(m.id);
                                  if (event.key === 'Escape') {
                                    setEditingMessageId(null);
                                    setEditingDraft('');
                                  }
                                }}
                                className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-1 text-sm"
                              />
                              <button onClick={() => void saveEditedMessage(m.id)} className="border border-[var(--chat-border)] px-2 py-1 text-xs">Save</button>
                              <button onClick={() => { setEditingMessageId(null); setEditingDraft(''); }} className="border border-[var(--chat-border)] px-2 py-1 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <>
                              {m.content}
                              {m.is_edited ? <span className="ml-2 text-[0.7rem] text-[var(--chat-muted)]">(edited)</span> : null}
                            </>
                          )}
                          {reactionMap[m.id] ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(reactionMap[m.id]).map(([emoji, reaction]) => {
                                const count = reaction?.count ?? 0;
                                if (!count) return null;
                                return (
                                  <button
                                    key={`${m.id}-${emoji}`}
                                    onClick={() => void toggleReaction(m.id, emoji as MessageReaction)}
                                    className={`rounded-full border border-[var(--chat-border)] px-2 py-0.5 text-xs ${reaction?.reactedByMe ? 'bg-[var(--chat-hover)] font-semibold' : ''}`}
                                  >
                                    {emoji} {count}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Typing indicator */}
            {typingUsers.size > 0 ? (
              <div className="px-4 py-1 text-xs text-[var(--chat-muted)] italic animate-pulse">
                {Array.from(typingUsers.keys()).map((uid) => {
                  const member = profileMap.get(uid);
                  return member?.display_name ?? member?.name ?? member?.username ?? 'Someone';
                }).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
              </div>
            ) : null}

            <div className="border-t border-[var(--chat-border)] p-4 bg-[var(--chat-side)]">
              {replyingTo ? (
                <div className="mb-2 flex items-center justify-between border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-xs">
                  <p>
                    Replying to <span className="font-semibold">{getMemberName(profileMap.get(replyingTo.user_id))}</span>: {replyingTo.content.slice(0, 80)}
                  </p>
                  <button onClick={() => setReplyingTo(null)} className="ml-3 text-[var(--chat-muted)] hover:text-[var(--chat-text)]">×</button>
                </div>
              ) : null}
              <div className="flex gap-2">
              <input value={text} onChange={(e) => { setText(e.target.value); emitTyping(); }} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }} className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2" placeholder="Message..." />
              <button onClick={() => sendMessage()} className="grid h-11 w-12 place-items-center border border-[var(--chat-border)] bg-[var(--chat-hover)] text-[var(--chat-text)]" aria-label="Send message">
                <span className="text-lg">➤</span>
              </button>
              </div>
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
                  <Avatar src={activeProfile?.avatar_url} name={getMemberName(activeProfile)} className="h-full w-full" />
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
                      <button disabled={savingChannelSettings} onClick={() => void saveChannelSettings()} className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4 disabled:opacity-50">Save</button>
                      <button onClick={() => { setEditingName(currentChannel?.name ?? ''); setEditingIsPrivate(Boolean(currentChannel?.is_private)); setIsEditingAbout(false); }} className="border border-[#6B6B6B] px-4">Cancel</button>
                    </div>
                  ) : (
                    <p className="border border-[#eee] bg-[#fafafa] px-3 py-2">{currentChannel.name}</p>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-[#666]">Visibility</p>
                    {!isEditingAbout ? (
                      <button onClick={() => setIsEditingAbout(true)} className="text-sm font-semibold text-[#1A1A1A] underline">Edit</button>
                    ) : null}
                  </div>
                  {isEditingAbout ? (
                    <div className="space-y-2 border border-[#eee] bg-[#fafafa] p-3">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={!editingIsPrivate} onChange={() => setEditingIsPrivate(false)} />
                        <span>Public - everyone in workspace can see it</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={editingIsPrivate} onChange={() => setEditingIsPrivate(true)} />
                        <span>Private - only channel members can see it</span>
                      </label>
                    </div>
                  ) : (
                    <p className="border border-[#eee] bg-[#fafafa] px-3 py-2">{currentChannel.is_private ? 'Private' : 'Public'}</p>
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
                {currentChannel.is_private ? (
                  <details className="border border-[#eee] bg-[#fafafa] p-3">
                    <summary className="cursor-pointer font-semibold">Add people</summary>
                    <div className="mt-3 max-h-52 overflow-auto border border-[#ddd] bg-[var(--chat-surface)]">
                      {addableChannelMembers.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-[#666]">Everyone in this workspace is already in this channel.</p>
                      ) : null}
                      {addableChannelMembers.map((member) => (
                        <label key={member.user_id} className="flex cursor-pointer items-center gap-3 border-b border-[#eee] px-3 py-2 last:border-b-0 hover:bg-[var(--chat-hover)]">
                          <input
                            type="checkbox"
                            checked={selectedChannelInviteUserIds.includes(member.user_id)}
                            onChange={(event) => toggleSelectedUserId(member.user_id, event.target.checked, 'settings')}
                          />
                          <span>
                            <span className="block font-semibold">{getMemberName(member)}</span>
                            <span className="block text-xs text-[#666]">@{member.username ?? member.email ?? 'unknown'}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        disabled={selectedChannelInviteUserIds.length === 0 || invitingMembers}
                        onClick={() => void inviteSelectedChannelMembers()}
                        className="border border-[#6B6B6B] bg-[var(--chat-hover)] px-4 py-2 text-[#1A1A1A] disabled:opacity-50"
                      >
                        {invitingMembers ? 'Adding...' : 'Add selected'}
                      </button>
                    </div>
                  </details>
                ) : null}
                {channelMembers.map((m) => (
                  <div key={m.user_id} className="border border-[#eee] p-3 flex items-center justify-between">
                    <button onClick={() => { setSelectedProfile(m); setProfilePanelOpen(true); }} className="text-left hover:underline">
                      <p className="font-semibold">{getMemberName(m)} {m.user_id === me?.id ? '(you)' : ''}</p>
                      <p className="text-sm text-[#666]">@{m.username ?? 'unknown'} · {m.role}</p>
                    </button>
                    <div className="flex items-center gap-2">
                      {m.user_id === workspaceOwnerId ? (
                        <span className="rounded-full bg-[var(--chat-hover)] px-3 py-1 text-xs font-semibold">Channel Manager</span>
                      ) : null}
                      {m.user_id !== me?.id ? (
                        <button onClick={() => void kickMember(m.user_id)} className="border border-[#B3261E] text-[#B3261E] px-3 py-1">Kick</button>
                      ) : null}
                    </div>
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
                <Avatar src={avatarPreview ?? me?.avatar_url} name={getMemberName(me)} className="h-full w-full" />
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
          onClose={() => { setInviteAfterCreateModalOpen(false); setInviteChannel(null); setSelectedInviteUserIds([]); }}
          className="max-w-2xl"
          bodyClassName="h-[420px]"
        >
          <div className="space-y-4">
            <p className="text-sm text-[#6B6B6B]">Choose workspace members to add to this private channel.</p>
            <details open className="border border-[#6B6B6B] bg-[#F7F4EE]">
              <summary className="cursor-pointer px-3 py-2 font-semibold">
                {selectedInviteUserIds.length ? `${selectedInviteUserIds.length} selected` : 'Select members'}
              </summary>
              <div className="max-h-56 overflow-auto border-t border-[#6B6B6B] bg-[var(--chat-surface)]">
                {members.filter((member) => member.user_id !== me?.id).length === 0 ? (
                  <p className="px-3 py-2 text-sm text-[#666]">No other workspace members available.</p>
                ) : null}
                {members.filter((member) => member.user_id !== me?.id).map((member) => (
                  <label key={member.user_id} className="flex cursor-pointer items-center gap-3 border-b border-[#eee] px-3 py-2 last:border-b-0 hover:bg-[var(--chat-hover)]">
                    <input
                      type="checkbox"
                      checked={selectedInviteUserIds.includes(member.user_id)}
                      onChange={(event) => toggleSelectedUserId(member.user_id, event.target.checked, 'create')}
                    />
                    <span>
                      <span className="block font-semibold">{getMemberName(member)}</span>
                      <span className="block text-xs text-[#666]">@{member.username ?? member.email ?? 'unknown'}</span>
                    </span>
                  </label>
                ))}
              </div>
            </details>
            <div className="flex items-center justify-end gap-2 pt-8">
              <button
                onClick={() => { setInviteAfterCreateModalOpen(false); setInviteChannel(null); setSelectedInviteUserIds([]); }}
                className="border border-[#6B6B6B] px-4 py-2"
              >
                Skip for now
              </button>
              <button
                onClick={() => void inviteMembersAfterCreate()}
                disabled={selectedInviteUserIds.length === 0 || invitingMembers}
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
