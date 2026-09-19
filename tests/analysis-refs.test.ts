import assert from "node:assert/strict";
import { test } from "node:test";
import { stripAnalysisRefs } from "../src/shared/lib/analysis-refs.ts";

test("bracketed lists of card, requirement and recommendation numbers disappear", () => {
  assert.equal(
    stripAnalysisRefs("Бронь оформлена и подтверждена (u1.7,u1.4,u1.9,u1.12)."),
    "Бронь оформлена и подтверждена."
  );
  assert.equal(
    stripAnalysisRefs("Сотрудник корректно представился и назвал компанию (u1.2,r1,r2,r3)."),
    "Сотрудник корректно представился и назвал компанию."
  );
  assert.equal(stripAnalysisRefs("Подтвердить номер клиента (рекомендация rec1)."), "Подтвердить номер клиента.");
  assert.equal(stripAnalysisRefs("Включать вопрос об удобстве (rec3, rec4)."), "Включать вопрос об удобстве.");
  assert.equal(stripAnalysisRefs("Клиент подтвердил итог брони (r16,r17)."), "Клиент подтвердил итог брони.");
  assert.equal(stripAnalysisRefs("Цитата (s1.1, s2.1) из разговора"), "Цитата из разговора");
});

test("a number used as a word becomes the title, or goes when there is none", () => {
  const titles = new Map([["u1.7", "Уточнение бюджета"], ["rec2", "Назвать цену заранее"]]);
  assert.equal(stripAnalysisRefs("Как в u1.7, клиент не ответил.", titles), "Как в «Уточнение бюджета», клиент не ответил.");
  assert.equal(stripAnalysisRefs("Выполнить рекомендация rec2 в начале.", titles), "Выполнить рекомендация «Назвать цену заранее» в начале.");
  assert.equal(stripAnalysisRefs("Смотри r9 для деталей."), "Смотри для деталей.");
});

test("schema field names and segment pointers leave no trace", () => {
  assert.equal(
    stripAnalysisRefs("Ирина представилась, что соответствует части assigned_unit. Все требуемые элементы assigned_unit присутствуют в s3.1."),
    "Ирина представилась, что соответствует части пункта. Все требуемые элементы пункта присутствуют."
  );
  assert.equal(stripAnalysisRefs("Проверено по source_segments и полю segment_id."), "Проверено по репликам и полю.");
  assert.equal(stripAnalysisRefs("Цитата в сегменте s2.1 подтверждает ответ."), "Цитата подтверждает ответ.");
  assert.equal(stripAnalysisRefs("Почта ivan_petrov@mail.ru и файл report_final.pdf"), "Почта ivan_petrov@mail.ru и файл report_final.pdf");
});

test("a field name after a preposition takes the case the preposition asks for", () => {
  assert.equal(stripAnalysisRefs("Это покрывает текст требования в assigned_unit."), "Это покрывает текст требования в пункте.");
  assert.equal(stripAnalysisRefs("Слова из assigned_unit прозвучали."), "Слова из пункта прозвучали.");
  assert.equal(stripAnalysisRefs("Это соответствует частям assigned_unit."), "Это соответствует частям пункта.");
  assert.equal(stripAnalysisRefs("Вопрос юнита относится к брони, как и юниты выше."), "Вопрос пункта относится к брони, как и пункты выше.");
  assert.equal(stripAnalysisRefs("Ответ есть в source_segments."), "Ответ есть в репликах.");
  assert.equal(stripAnalysisRefs("Участник в реплике s1.1 сообщил о записи."), "Участник сообщил о записи.");
});

test("speaker markers survive untouched for the name lookup that follows", () => {
  assert.equal(stripAnalysisRefs("{{speaker:speaker_0}} назвал цену (u1.2)."), "{{speaker:speaker_0}} назвал цену.");
  assert.equal(stripAnalysisRefs("{{speaker:s1}} и {{speaker:A}} договорились."), "{{speaker:s1}} и {{speaker:A}} договорились.");
});

test("ordinary text with letters and digits stays as it is", () => {
  for (const text of ["Версия 2.1 работает", "Тариф Pro24 подключён", "Модуль u2f не нужен", "Отдел R&D на связи", "Звонок в 14:02"]) {
    assert.equal(stripAnalysisRefs(text), text);
  }
});
