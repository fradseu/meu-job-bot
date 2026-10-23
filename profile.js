const DEFAULT_PROFILE = {
  include: [
    "desenvolvedor",
    "desenvolvedora",
    "developer",
    "software engineer",
    "engenheiro de software",
    "engenharia de software",
    "programador",
    "programadora",
    "analista de sistemas",
    "analista desenvolvedor",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "fullstack",
    "full stack",
    "full-stack",
    "javascript",
    "typescript",
    "node",
    "react",
    "python",
    "java",
    "golang",
    ".net",
    "php",
    "junior",
    "júnior",
    "pleno",
    "estágio",
    "estagio"
  ],
  exclude: [
    "analista administrativo",
    "assistente administrativo",
    "auxiliar administrativo",
    "auxiliar de escritório",
    "recepcionista",
    "secretária",
    "secretaria",
    "faturista",
    "telemarketing",
    "vendedor",
    "operador de caixa",
    "help desk",
    "helpdesk",
    "service desk",
    "suporte técnico",
    "suporte ao usuário",
    "infraestrutura",
    "operador de computador"
  ],
  cities: [],
  minScore: 4,
  maxApplies: 3
};

const SEARCHES = [
  {
    site: "Catho",
    label: "Desenvolvedor",
    url: "https://www.catho.com.br/vagas/desenvolvedor/"
  },
  {
    site: "Catho",
    label: "Engenheiro de software",
    url: "https://www.catho.com.br/vagas/engenheiro-de-software/"
  },
  {
    site: "Catho",
    label: "Analista de sistemas",
    url: "https://www.catho.com.br/vagas/analista-de-sistemas/"
  },
  {
    site: "InfoJobs",
    label: "Desenvolvedor",
    url: "https://www.infojobs.com.br/vagas-de-emprego-desenvolvedor.aspx"
  },
  {
    site: "InfoJobs",
    label: "Desenvolvedor júnior",
    url: "https://www.infojobs.com.br/vagas-de-desenvolvedor-junior.aspx"
  },
  {
    site: "InfoJobs",
    label: "Analista de sistemas",
    url: "https://www.infojobs.com.br/vagas-de-analista-sistemas.aspx"
  },
  {
    site: "LinkedIn",
    label: "Desenvolvedor júnior",
    url: "https://www.linkedin.com/jobs/search/?keywords=desenvolvedor%20j%C3%BAnior&location=Brasil&f_TPR=r604800"
  },
  {
    site: "Programathor",
    label: "Vagas de tecnologia",
    url: "https://programathor.com.br/jobs"
  },
  {
    site: "Gupy",
    label: "Busca desenvolvedor",
    url: "https://portal.gupy.io/job-search/term=desenvolvedor"
  }
];
