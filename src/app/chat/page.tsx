'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { ModalShell } from '@/components/modal-shell';

type Channel = { id: string; name: string; workspace_id: string };
type Member = { user_id: string; role: string; name?: string | null; username?: string | null; email?: string | null; avatar_url?: string | null };
type Conv = { id: string; workspace_id: string; peer_user_id: string | null };
type Msg = { id: string; user_id: string; content: string; created_at: string };
type Me = { id: string; email: string; name?: string | null; username?: string | null };

type Tab = 'about' | 'members';

export default function ChatPage() {
  const router = useRouter();
  const search = useSearchParams();
  const workspaceId = search.get('workspaceId') ?? '';

  const [me, setMe] = useState<Me | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [channelMembers, setChannelMembers] = useState<Member[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [selectedConv, setSelectedConv] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [newChannel, setNewChannel] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('about');
  const [editingName, setEditingName] = useState('');
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Member | null>(null);

  const scope = useMemo(() => (selectedConv ? 'dm' : 'channel'), [selectedConv]);
  const currentChannel = useMemo(() => channels.find((c) => c.id === selectedChannel) ?? null, [channels, selectedChannel]);

  const profileMap = useMemo(() => {
    const map = new Map<string, Member>();
    [...members, ...channelMembers].forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members, channelMembers]);

  async function load() {
    if (!workspaceId) return;
    const [meRes, ch, mem, dm] = await Promise.all([
      apiCall<{ ok: boolean; user: Me }>('/api/identity/secure/users/me', { method: 'GET' }, true),
      apiCall<{ ok: boolean; channels: Channel[] }>(`/api/ws/workspaces/${workspaceId}/sidebar/channels`, { method: 'GET' }, true),
      apiCall<{ ok: boolean; members: Member[] }>(`/api/ws/workspaces/${workspaceId}/members`, { method: 'GET' }, true),
      apiCall<{ ok: boolean; conversations: Conv[] }>(`/api/chat/conversations/direct/${workspaceId}`, { method: 'GET' }, true),
    ]);
    setMe(meRes.user ?? null);
    setChannels(ch.channels ?? []);
    setMembers(mem.members ?? []);
    setConvs(dm.conversations ?? []);
    if (!selectedChannel && ch.channels?.[0]?.id) setSelectedChannel(ch.channels[0].id);
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
    }
  }

  async function loadChannelMembers() {
    if (!selectedChannel || !workspaceId) return;
    const res = await apiCall<{ ok: boolean; members: Member[] }>(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}/members`, { method: 'GET' }, true);
    setChannelMembers(res.members ?? []);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [workspaceId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = window.setTimeout(() => void loadMessages(), 0);
    return () => window.clearTimeout(id);
  }, [selectedChannel, selectedConv]);

  async function createChannel() {
    if (!newChannel.trim()) return;
    await apiCall(`/api/ws/channels/workspaces/${workspaceId}`, { method: 'POST', body: JSON.stringify({ name: newChannel.trim() }) }, true);
    setNewChannel('');
    await load();
    setIsEditingAbout(false);
  }

  async function openDm(peerUserId: string) {
    const res = await apiCall<{ ok: boolean; conversation: Conv }>(`/api/chat/conversations/direct`, {
      method: 'POST', body: JSON.stringify({ workspaceId, peerUserId }),
    }, true);
    setSelectedChannel('');
    setSelectedConv(res.conversation.id);
    await load();
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
    await load();
  }

  async function leaveChannel() {
    if (!selectedChannel) return;
    await apiCall(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}/leave`, { method: 'DELETE' }, true);
    setModalOpen(false);
    setSelectedChannel('');
    await load();
  }

  async function kickMember(targetUserId: string) {
    if (!selectedChannel) return;
    await apiCall(`/api/ws/channels/workspace/${workspaceId}/${selectedChannel}/members/${targetUserId}`, { method: 'DELETE' }, true);
    await loadChannelMembers();
  }

  return (
    <main className="h-screen w-full bg-[#D9D6D0] text-[#1A1A1A] grid grid-rows-[auto_1fr]">
      <header className="border-b border-[#6B6B6B] bg-[#D9D6D0] px-4 py-3 md:px-8">
        <button onClick={() => router.push('/workspaces')} className="border border-[#6B6B6B] px-3 py-2 text-sm hover:bg-[#F0EDE6]">Back to workspaces</button>
      </header>

      <div className="grid min-h-0 w-full grid-cols-[280px_1fr] border-t border-[#6B6B6B] bg-[#F0EDE6]">
        <aside className="border-r border-[#6B6B6B] bg-[#D9D6D0] p-4 overflow-auto">
          <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#4E4E4E]">Channels</p>
          <div className="mt-2 space-y-1">
            {channels.map((c) => (
              <button key={c.id} onClick={() => { setSelectedConv(''); setSelectedChannel(c.id); }} className={`block w-full px-2 py-1 text-left ${selectedChannel === c.id ? 'bg-[#D4E157]' : 'hover:bg-[#F0EDE6]'}`}># {c.name}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} className="w-full border border-[#6B6B6B] bg-white px-2 py-1 text-sm" placeholder="new-channel" />
            <button onClick={createChannel} className="border border-[#6B6B6B] bg-[#D4E157] px-2">+</button>
          </div>

          <p className="mt-6 text-[0.72rem] uppercase tracking-[0.1em] text-[#4E4E4E]">Direct messages</p>
          <div className="mt-2 space-y-1">
            {convs.map((c) => (
              <button key={c.id} onClick={() => { setSelectedChannel(''); setSelectedConv(c.id); }} className={`block w-full px-2 py-1 text-left ${selectedConv === c.id ? 'bg-[#D4E157]' : 'hover:bg-[#F0EDE6]'}`}>@ {profileMap.get(c.peer_user_id ?? '')?.name ?? profileMap.get(c.peer_user_id ?? '')?.username ?? c.peer_user_id?.slice(0, 8) ?? 'unknown'}</button>
            ))}
          </div>

          <p className="mt-4 text-[0.72rem] uppercase tracking-[0.1em] text-[#4E4E4E]">Start DM</p>
          <div className="mt-2 space-y-1">
            {members.map((m) => (
              <button key={m.user_id} onClick={() => openDm(m.user_id)} className="block w-full px-2 py-1 text-left hover:bg-[#F0EDE6]">@ {m.name ?? m.username ?? m.user_id.slice(0, 8)}</button>
            ))}
          </div>
        </aside>

        <section className="grid min-h-0 grid-cols-[1fr_380px] bg-[#F0EDE6]">
          <div className="grid min-h-0 grid-rows-[auto_1fr_auto]">
            <header className="border-b border-[#6B6B6B] px-6 py-4 flex items-center gap-3">
              <button onClick={openChannelSettings} className="text-3xl font-extrabold hover:underline">{scope === 'dm' ? 'Direct Message' : `# ${currentChannel?.name ?? 'channel'}`}</button>
              {scope === 'channel' ? <button onClick={openChannelSettings} className="border border-[#6B6B6B] px-2 py-1 text-sm">✎</button> : null}
            </header>

            <div className="overflow-auto p-6 space-y-3">
              {messages.map((m) => {
                const profile = profileMap.get(m.user_id);
                return (
                  <div key={m.id} className="border border-[#D9D6D0] bg-white p-3">
                    <button onClick={() => profile && setSelectedProfile(profile)} className="text-[0.72rem] uppercase tracking-[0.1em] text-[#6B6B6B] hover:underline">
                      {profile?.name ?? profile?.username ?? m.user_id.slice(0, 8)}
                    </button>
                    <p className="text-[#1A1A1A]">{m.content}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-[#6B6B6B] p-4 flex gap-2 bg-[#D9D6D0]">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sendMessage(); }} className="w-full border border-[#6B6B6B] bg-white px-3 py-2" placeholder="Message..." />
              <button onClick={() => void sendMessage()} className="border border-[#6B6B6B] bg-[#D4E157] px-4 py-2 font-semibold">Send</button>
            </div>
          </div>

          <aside className="border-l border-[#6B6B6B] bg-[#ffffff] p-4 overflow-auto">
            {selectedProfile ? (
              <>
                <h3 className="text-3xl font-bold mb-4">Profile</h3>
                <div className="border border-[#6B6B6B] p-4">
                  <p className="text-2xl font-bold">{selectedProfile.name ?? 'No name'}</p>
                  <p className="text-sm text-[#666] mt-1">@{selectedProfile.username ?? 'unknown'}</p>
                  <p className="text-sm text-[#666] mt-1">{selectedProfile.email ?? 'No email'}</p>
                  <p className="text-sm mt-3">Role: {selectedProfile.role}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-[#666]">Click a member name to view profile.</p>
            )}
          </aside>
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
                      <button onClick={() => void saveChannelName()} className="border border-[#6B6B6B] bg-[#D4E157] px-4">Save</button>
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
                    <button onClick={() => setSelectedProfile(m)} className="text-left hover:underline">
                      <p className="font-semibold">{m.name ?? m.username ?? m.user_id.slice(0, 8)} {m.user_id === me?.id ? '(you)' : ''}</p>
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
    </main>
  );
}
