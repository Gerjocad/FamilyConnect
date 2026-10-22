// Pinnwand: Kommentare und Reaktionen (Server: server/src/postExtras.js)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { onLiveChange } from './live';
import { useFamily } from './session';

/** gleiche Reihenfolge wie REACTIONS auf dem Server */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🙏'];

export interface PostComment { id: number; post_id: number; user_id: number | null; text: string; created_at: string }
export interface PostReaction { post_id: number; user_id: number; emoji: string }

export function usePostExtras() {
  const { family } = useFamily();
  const base = `/families/${family.id}`;
  const [comments, setComments] = useState<PostComment[]>([]);
  const [reactions, setReactions] = useState<PostReaction[]>([]);
  const reload = useCallback(async () => {
    try {
      const data = await api<{ comments: PostComment[]; reactions: PostReaction[] }>(`${base}/post-extras`);
      setComments(data.comments);
      setReactions(data.reactions);
    } catch {
      // offline
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return onLiveChange((resource) => (resource === 'post-extras' || resource === 'posts') && void reload());
  }, [reload]);

  return {
    commentsFor: (postId: number) => comments.filter((c) => c.post_id === postId),
    reactionsFor: (postId: number) => reactions.filter((r) => r.post_id === postId),
    comment: async (postId: number, text: string) => {
      await api(`${base}/posts/${postId}/comments`, { method: 'POST', body: { text } });
      await reload();
    },
    removeComment: async (id: number) => {
      await api(`${base}/post-comments/${id}`, { method: 'DELETE' });
      await reload();
    },
    react: async (postId: number, userId: number, emoji: string | null) => {
      // sofort anzeigen, Server bestätigt im Hintergrund
      setReactions((prev) => [...prev.filter((r) => !(r.post_id === postId && r.user_id === userId)), ...(emoji ? [{ post_id: postId, user_id: userId, emoji }] : [])]);
      try {
        await api(`${base}/posts/${postId}/reaction`, { method: 'PUT', body: { emoji } });
      } finally {
        void reload();
      }
    },
  };
}

export type PostExtras = ReturnType<typeof usePostExtras>;
