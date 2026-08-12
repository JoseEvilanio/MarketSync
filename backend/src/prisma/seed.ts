import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Admin padrão
  const senhaHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@mercadinho.local' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@mercadinho.local',
      senha: senhaHash,
      perfil: 'ADMINISTRADOR',
    },
  });
  console.log(`✅ Usuário admin: ${admin.email}`);

  // Gerente de exemplo
  const senhaGerente = await bcrypt.hash('gerente123', 12);
  await prisma.usuario.upsert({
    where: { email: 'gerente@mercadinho.local' },
    update: {},
    create: {
      nome: 'Gerente',
      email: 'gerente@mercadinho.local',
      senha: senhaGerente,
      perfil: 'GERENTE',
    },
  });

  // Operador de caixa
  const senhaCaixa = await bcrypt.hash('caixa123', 12);
  await prisma.usuario.upsert({
    where: { email: 'caixa@mercadinho.local' },
    update: {},
    create: {
      nome: 'Operador Caixa',
      email: 'caixa@mercadinho.local',
      senha: senhaCaixa,
      perfil: 'CAIXA',
    },
  });

  // Categorias
  const categorias = [
    'Bebidas', 'Laticínios', 'Padaria', 'Hortifrúti', 'Carnes',
    'Frios e Embutidos', 'Higiene Pessoal', 'Limpeza', 'Mercearia',
    'Snacks e Biscoitos', 'Congelados', 'Cereais', 'Bebidas Alcoólicas', 'Utencílios'
  ];

  for (const nome of categorias) {
    await prisma.categoria.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }
  console.log(`✅ ${categorias.length} categorias criadas`);

  // Marcas
  const marcas = ['Nestlé', 'Unilever', 'Coca-Cola', 'Ambev', 'BRF', 'JBS', 'Danone', 'Grupo Pão de Açúcar'];
  for (const nome of marcas) {
    await prisma.marca.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }

  // Fornecedores de exemplo
  await prisma.fornecedor.upsert({
    where: { cnpj: '00.000.000/0001-00' },
    update: {},
    create: {
      nome: 'Distribuidora Central',
      razaoSocial: 'Distribuidora Central Ltda',
      cnpj: '00.000.000/0001-00',
      telefone: '(11) 99999-0000',
      email: 'contato@distribuidora.local',
    },
  });

  // Configurações padrão
  const configs = [
    { chave: 'NOME_ESTABELECIMENTO', valor: 'Mercadinho Local', descricao: 'Nome do estabelecimento' },
    { chave: 'CNPJ_ESTABELECIMENTO', valor: '', descricao: 'CNPJ do estabelecimento' },
    { chave: 'ENDERECO_ESTABELECIMENTO', valor: '', descricao: 'Endereço do estabelecimento' },
    { chave: 'TELEFONE_ESTABELECIMENTO', valor: '', descricao: 'Telefone do estabelecimento' },
    { chave: 'CABECALHO_CUPOM', valor: 'Obrigado pela preferência!', descricao: 'Cabeçalho do cupom' },
    { chave: 'RODAPE_CUPOM', valor: 'Volte Sempre!', descricao: 'Rodapé do cupom' },
    { chave: 'IMPRESSORA_CUPOM', valor: '', descricao: 'Porta/IP da impressora de cupom' },
    { chave: 'LARGURA_PAPEL', valor: '80', descricao: 'Largura do papel em mm (58 ou 80)' },
    { chave: 'versao_sistema', valor: '1.0.0', descricao: 'Versão atual do sistema' },
  ];

  for (const config of configs) {
    await prisma.configuracao.upsert({
      where: { chave: config.chave },
      update: {},
      create: config,
    });
  }
  console.log('✅ Configurações padrão criadas');

  // Produtos de exemplo
  const bebidasCat = await prisma.categoria.findFirst({ where: { nome: 'Bebidas' } });
  const laticiniosCat = await prisma.categoria.findFirst({ where: { nome: 'Laticínios' } });
  const merceariaCat = await prisma.categoria.findFirst({ where: { nome: 'Mercearia' } });

  const produtosExemplo = [
    { codigoBarras: '7891000100103', nome: 'Coca-Cola 2L', precoCompra: 5.50, precoVenda: 8.99, categoriaId: bebidasCat?.id, unidade: 'UN', estoqueAtual: 48, estoqueMinimo: 12 },
    { codigoBarras: '7891000053508', nome: 'Leite Integral 1L', precoCompra: 3.80, precoVenda: 5.49, categoriaId: laticiniosCat?.id, unidade: 'UN', estoqueAtual: 60, estoqueMinimo: 24 },
    { codigoBarras: '7891149105759', nome: 'Açúcar Cristal 1kg', precoCompra: 3.20, precoVenda: 4.99, categoriaId: merceariaCat?.id, unidade: 'KG', estoqueAtual: 35, estoqueMinimo: 10 },
    { codigoBarras: '7891910000197', nome: 'Arroz Tipo 1 5kg', precoCompra: 14.50, precoVenda: 19.99, categoriaId: merceariaCat?.id, unidade: 'KG', estoqueAtual: 20, estoqueMinimo: 8 },
    { codigoBarras: '7896036090014', nome: 'Feijão Carioca 1kg', precoCompra: 5.80, precoVenda: 8.49, categoriaId: merceariaCat?.id, unidade: 'KG', estoqueAtual: 25, estoqueMinimo: 10 },
  ];

  for (const p of produtosExemplo) {
    if (!p.categoriaId) continue;
    await prisma.produto.upsert({
      where: { codigoBarras: p.codigoBarras },
      update: {},
      create: {
        ...p,
        margemLucro: ((p.precoVenda - p.precoCompra) / p.precoVenda) * 100,
      } as any,
    });
  }
  console.log('✅ Produtos de exemplo criados');

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Credenciais padrão:');
  console.log('   Admin:   admin@mercadinho.local   / admin123');
  console.log('   Gerente: gerente@mercadinho.local / gerente123');
  console.log('   Caixa:   caixa@mercadinho.local   / caixa123');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
