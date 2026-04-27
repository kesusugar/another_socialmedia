from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class CTRModel(nn.Module):
    """Logistic regression CTR predictor over 18-dim feature vector."""

    INPUT_DIM = 18  # 5 user prefs + 5 ad vector + 5 cat onehot + 3 context

    def __init__(self) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(self.INPUT_DIM, 32),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)

    def predict_proba(self, x: torch.Tensor) -> float:
        self.eval()
        with torch.no_grad():
            inp = x.unsqueeze(0) if x.dim() == 1 else x
            return float(self.forward(inp).squeeze())


class MFModel(nn.Module):
    """Matrix Factorization with user/item embeddings."""

    EMBED_DIM = 16

    def __init__(self, num_users: int, num_ads: int) -> None:
        super().__init__()
        self.user_emb  = nn.Embedding(num_users, self.EMBED_DIM)
        self.ad_emb    = nn.Embedding(num_ads,   self.EMBED_DIM)
        self.user_bias = nn.Embedding(num_users, 1)
        self.ad_bias   = nn.Embedding(num_ads,   1)
        nn.init.normal_(self.user_emb.weight, std=0.1)
        nn.init.normal_(self.ad_emb.weight,   std=0.1)
        nn.init.zeros_(self.user_bias.weight)
        nn.init.zeros_(self.ad_bias.weight)

    def forward(self, user_idx: torch.Tensor, ad_idx: torch.Tensor) -> torch.Tensor:
        u   = self.user_emb(user_idx)
        a   = self.ad_emb(ad_idx)
        dot = (u * a).sum(dim=1)
        bias = self.user_bias(user_idx).squeeze(1) + self.ad_bias(ad_idx).squeeze(1)
        return torch.sigmoid(dot + bias)

    def predict_proba(self, user_idx: int, ad_idx: int) -> float:
        self.eval()
        with torch.no_grad():
            u = torch.tensor([user_idx], dtype=torch.long)
            a = torch.tensor([ad_idx],   dtype=torch.long)
            return float(self.forward(u, a).squeeze())


class SessionGRUModel(nn.Module):
    """GRU over last-N events to predict next category distribution."""

    INPUT_DIM  = 10   # 5 ad_vector + 4 event_type_onehot + 1 dwell_norm
    HIDDEN_DIM = 32
    NUM_CATS   = 5

    def __init__(self) -> None:
        super().__init__()
        self.gru    = nn.GRU(self.INPUT_DIM, self.HIDDEN_DIM, batch_first=True)
        self.drop   = nn.Dropout(0.2)
        self.linear = nn.Linear(self.HIDDEN_DIM, self.NUM_CATS)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, seq_len, INPUT_DIM) → (B, NUM_CATS) log-softmax
        _, h = self.gru(x)
        h = h.squeeze(0)
        return F.log_softmax(self.linear(self.drop(h)), dim=-1)

    def predict_category_probs(self, seq: torch.Tensor) -> list[float]:
        """seq: (seq_len, INPUT_DIM) → list of 5 probabilities."""
        self.eval()
        with torch.no_grad():
            x = seq.unsqueeze(0)
            log_probs = self.forward(x).squeeze(0)
            return log_probs.exp().tolist()
