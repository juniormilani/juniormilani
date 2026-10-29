'use client';
import type { Empresa } from '@/lib/empresa';
import { Icone } from './Icone';

/** Botões de contato direto (ligar, WhatsApp, e-mail, site) — alvos de toque grandes no celular. */
export function AcoesContato({ e, compacto = false }: { e: Empresa; compacto?: boolean }) {
  const tel = e.telefones[0];
  const zap = e.whatsapp[0]?.numero ?? e.telefones.find((t) => t.celular)?.numero;
  const zapConfirmado = !!e.whatsapp[0];
  const email = e.emails.find((m) => !m.possivelContador) ?? e.emails[0];
  const site = e.sites[0]?.url ?? (e.siteProvavel ? `https://${e.siteProvavel}` : null);
  const cls = `btn ${compacto ? 'pequeno' : ''}`;
  if (!tel && !zap && !email && !site) return <span className="vazio">Sem contato nas fontes</span>;
  return (
    <div className="acoes-contato botoes">
      {tel && <a className={cls} href={`tel:+55${tel.numero}`} title={tel.formatado}><Icone nome="telefone" tamanho={16} />Ligar</a>}
      {zap && (
        <a className={`${cls} ${zapConfirmado ? '' : 'tracejado'}`} href={`https://wa.me/55${zap}`} target="_blank" rel="noopener noreferrer"
          title={zapConfirmado ? 'WhatsApp confirmado' : 'Celular: WhatsApp não confirmado'}>
          <Icone nome="whatsapp" tamanho={16} />WhatsApp
        </a>
      )}
      {email && <a className={cls} href={`mailto:${email.email}`} title={email.email}><Icone nome="email" tamanho={16} />E-mail</a>}
      {site && <a className={cls} href={site} target="_blank" rel="noopener noreferrer" title={e.sites[0] ? site : 'Site provável (não verificado)'}><Icone nome="site" tamanho={16} />Site</a>}
    </div>
  );
}
