// Bayley-Pinneau percent-of-adult-height tables.
//
// Original source: Bayley N, Pinneau SR. J Pediatr. 1952;40(4):423-441.
// "Tables for predicting adult height from skeletal age"
//
// Three columns per sex depending on skeletal age (SA) vs chronological age (CA):
//   - accelerated: SA >= CA + 1.0 year
//   - average:     |SA - CA| < 1.0 year
//   - delayed:     SA <= CA - 1.0 year
//
// Values are the percent of adult height attained at the given skeletal age.
// Blanks in the original are carried forward with the "average" column.
//
// These values are widely reproduced in pediatric endocrinology references;
// they are an approximation of the original Bayley-Pinneau tables, suitable
// for computational use but not a substitute for clinical interpretation.

export const BAYLEY_PINNEAU = {
  boys: {
    //        [accelerated, average, delayed]
    7.0:  [69.5, 69.5, 69.5],
    7.5:  [72.3, 72.3, 70.5],
    8.0:  [76.1, 75.0, 72.0],
    8.5:  [78.4, 76.7, 73.4],
    9.0:  [80.4, 78.4, 75.2],
    9.5:  [82.3, 80.4, 76.9],
    10.0: [84.1, 82.1, 78.6],
    10.5: [85.8, 84.0, 80.4],
    11.0: [87.6, 85.9, 82.1],
    11.5: [89.4, 88.0, 83.6],
    12.0: [91.2, 90.0, 85.1],
    12.5: [92.8, 91.9, 87.1],
    13.0: [94.5, 93.8, 89.1],
    13.5: [95.9, 95.4, 91.3],
    14.0: [97.2, 97.0, 93.4],
    14.5: [98.0, 97.8, 95.3],
    15.0: [98.8, 98.6, 97.2],
    15.5: [99.2, 99.0, 98.0],
    16.0: [99.6, 99.5, 98.7],
    16.5: [99.8, 99.7, 99.1],
    17.0: [99.9, 99.9, 99.5],
    17.5: [100.0, 100.0, 99.8],
    18.0: [100.0, 100.0, 100.0],
  },
  girls: {
    6.0:  [72.0, 72.0, 72.0],
    6.5:  [75.5, 73.8, 73.8],
    7.0:  [79.0, 75.7, 75.7],
    7.5:  [81.3, 77.2, 76.3],
    8.0:  [83.6, 79.0, 77.0],
    8.5:  [85.4, 80.8, 78.6],
    9.0:  [87.1, 82.7, 80.2],
    9.5:  [88.5, 84.4, 82.0],
    10.0: [89.8, 86.2, 83.8],
    10.5: [91.0, 88.1, 85.8],
    11.0: [92.2, 90.1, 87.9],
    11.5: [93.3, 92.3, 90.2],
    12.0: [94.3, 94.5, 92.5],
    12.5: [95.4, 95.7, 94.0],
    13.0: [96.4, 96.8, 95.6],
    13.5: [97.2, 97.4, 96.7],
    14.0: [98.0, 98.0, 97.8],
    14.5: [98.5, 98.5, 98.4],
    15.0: [99.0, 99.0, 99.0],
    15.5: [99.3, 99.3, 99.3],
    16.0: [99.6, 99.6, 99.6],
    16.5: [99.8, 99.8, 99.8],
    17.0: [100.0, 100.0, 100.0],
    17.5: [100.0, 100.0, 100.0],
    18.0: [100.0, 100.0, 100.0],
  },
};
