import { StockStrategyEvaluation, EvaluationParameter } from './S1ToS10ForensicReplayEngine';

export interface ParameterDecisionRow {
  conditionName: string;
  observedValueStr: string;
  operator: string;
  requiredThresholdStr: string;
  passFail: 'PASS' | 'FAIL';
  sourceField: string;
  formula: string;
}

export interface ParameterMatrixAndExplanation {
  evaluationId: string;
  symbol: string;
  strategyId: string;
  date: string;
  decisionTable: ParameterDecisionRow[];
  businessExplanation: {
    whyQualifiedOrFailed: string;
    whatStrategyDetects: string;
    whatStockShowed: string;
    conditionByConditionText: string[];
    finalDecisionSummary: string;
  };
}

export class ParameterMatrixGenerator {
  public generateMatrixAndExplanation(evalResult: StockStrategyEvaluation): ParameterMatrixAndExplanation {
    const decisionTable: ParameterDecisionRow[] = evalResult.parameters.map((p) => ({
      conditionName: p.parameterName,
      observedValueStr: `${p.actualValue} ${p.unit}`,
      operator: p.operator,
      requiredThresholdStr: `${p.threshold} ${p.thresholdUnit}`,
      passFail: p.passFail,
      sourceField: p.sourceField,
      formula: p.formula,
    }));

    const passedParams = evalResult.parameters.filter((p) => p.passFail === 'PASS');
    const failedParams = evalResult.parameters.filter((p) => p.passFail === 'FAIL');

    const whatStrategyDetects = `Strategy ${evalResult.strategyId} (${evalResult.strategyName}) is designed to capture specific quantitative price, volume, structural, or fundamental market behaviors in PIT NIFTY 500 equities.`;

    const whatStockShowed = evalResult.parameters
      .map((p) => `${p.parameterName} reached ${p.actualValue} ${p.unit} (required ${p.operator} ${p.threshold} ${p.thresholdUnit}, result: ${p.passFail})`)
      .join('; ');

    const conditionByConditionText = evalResult.parameters.map((p) => {
      if (p.passFail === 'PASS') {
        return `Condition '${p.parameterName}' evaluated PASS: observed ${p.actualValue} ${p.unit} satisfied requirement (${p.operator} ${p.threshold} ${p.thresholdUnit}).`;
      } else {
        return `Condition '${p.parameterName}' evaluated FAIL: observed ${p.actualValue} ${p.unit} did NOT satisfy requirement (${p.operator} ${p.threshold} ${p.thresholdUnit}).`;
      }
    });

    let whyQualifiedOrFailed = '';
    let finalDecisionSummary = '';

    if (evalResult.strategySignal) {
      whyQualifiedOrFailed = `${evalResult.symbol} generated an ${evalResult.strategyId} (${evalResult.strategyName}) signal on ${evalResult.date} because all ${evalResult.totalParametersCount} coded parameters strictly satisfied their required quantitative thresholds.`;
      finalDecisionSummary = `STRATEGY DECISION: SIGNAL = TRUE (All ${evalResult.totalParametersCount} conditions PASS).`;
    } else {
      whyQualifiedOrFailed = `${evalResult.symbol} DID NOT qualify for ${evalResult.strategyId} on ${evalResult.date} because ${failedParams.length} of ${evalResult.totalParametersCount} coded parameters failed requirements. Failed condition(s): ${failedParams.map((f) => f.parameterName).join(', ')}.`;
      finalDecisionSummary = `STRATEGY DECISION: SIGNAL = FALSE (${failedParams.length} condition(s) FAIL).`;
    }

    return {
      evaluationId: evalResult.evaluationId,
      symbol: evalResult.symbol,
      strategyId: evalResult.strategyId,
      date: evalResult.date,
      decisionTable,
      businessExplanation: {
        whyQualifiedOrFailed,
        whatStrategyDetects,
        whatStockShowed,
        conditionByConditionText,
        finalDecisionSummary,
      },
    };
  }
}
