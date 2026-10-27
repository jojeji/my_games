---
status: proposed
---

# Psst!: Mehrspieler über einen Cloudflare-Spielraum statt Bluetooth oder WebRTC

Mehrere Handys und ein Fernseher sollen sich zu einem Spiel verbinden, auf iOS und Android, aus einer reinen Web-App. Bluetooth fällt aus: Safari auf dem iPhone hat kein Web Bluetooth. Google Cast fällt aus, weil es auf dem iPhone nicht geht. Lokales WLAN ohne Server geht nur über WebRTC mit QR-Handschlag. Das bedeutet zwei Scans pro Gerät, kein Fernseher, Probleme in Gast-WLANs und auf dem iPhone. Gewählt ist deshalb ein eigener Cloudflare Worker mit Durable Object als „Spielraum“: Alle Geräte verbinden sich per WebSocket, beigetreten wird über einen QR-Code oder einen Raumcode, das Gastgeber-Gerät rechnet das Spiel (die bestehende reine Spiellogik) und verteilt den Zustand. Die Gratis-Grenzen (100.000 Anfragen pro Tag) liegen weit über dem Bedarf, die Latenz liegt bei 20 bis 60 ms.

## Consequences

- Mehrspieler braucht durchgehend Internet. Das Spiel mit einem Handy bleibt offline spielbar.
- Der Besitzer braucht ein Cloudflare-Konto. Der API-Token liegt nur als GitHub-Secret vor, der Worker wird per GitHub Actions veröffentlicht.
- Spielen aus verschiedenen Orten wird nebenbei möglich.
- Umsetzung erst, nachdem Psst! mit einem Handy geprüft und gespielt wurde.
