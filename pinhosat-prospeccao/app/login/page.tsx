'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icone } from '@/components/Icone';

/** Só aceita caminhos internos (evita redirecionar para outro site após o login). */
function destinoSeguro(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/login') ? v : '/';
}

function FormularioLogin() {
  const volta = destinoSeguro(useSearchParams().get('volta'));
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(true);
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const entrar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const r = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha, lembrar }),
      });
      if (!r.ok) {
        setErro((await r.json().catch(() => ({}))).erro ?? 'Não foi possível entrar.');
        setEntrando(false);
        return;
      }
      window.location.replace(volta);
    } catch {
      setErro('Sem conexão. Tente novamente.');
      setEntrando(false);
    }
  };

  return (
    <form className="cartao login-cartao" onSubmit={entrar}>
      <div className="login-marca">
        <span className="logo"><Icone nome="caminhao" tamanho={22} /></span>
        <div>
          <strong>PinhoSat Prospecção</strong>
          <div className="mudo">Acesso restrito à equipe comercial</div>
        </div>
      </div>
      <label htmlFor="usuario">Usuário</label>
      <input id="usuario" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={usuario} onChange={(e) => setUsuario(e.target.value)} required autoFocus />
      <label htmlFor="senha">Senha</label>
      <div className="campo-senha">
        <input id="senha" type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha}
          onChange={(e) => setSenha(e.target.value)} required />
        <button type="button" className="btn fantasma pequeno" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}>
          {ver ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <label className="check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> Manter conectado neste dispositivo (30 dias)
      </label>
      {erro && <div className="erro-box" role="alert">{erro}</div>}
      <button className="btn primario grande" style={{ marginTop: 14 }} disabled={entrando || !usuario || !senha}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

export default function Login() {
  return (
    <div className="login-pagina">
      <Suspense fallback={null}><FormularioLogin /></Suspense>
    </div>
  );
}
